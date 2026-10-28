import { config } from "./config";
import { demoFetch } from "@/demo/fake-api";

/**
 * Shopify authentication.
 *
 * Apps created in Shopify's dev dashboard get a Client ID and Secret, not a
 * static `shpat_` token — only store-level custom apps issue those. The Secret
 * is exchanged for a short-lived access token via the client credentials
 * grant, the standard flow for dev-dashboard apps.
 *
 * Cached until just before expiry so a burst of requests costs one exchange.
 * A static token, if one is configured, wins and skips all of this.
 */
let tokenCache = { token: "", expiresAt: 0 };
let pendingToken: Promise<string> | null = null;

async function requestToken(): Promise<string> {
  const res = await demoFetch(
    `https://${config.shopify.storeDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.shopify.clientId,
        client_secret: config.shopify.clientSecret,
      }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Shopify auth ${res.status}: ${body.slice(0, 300)}. Check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.`,
    );
  }

  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new Error("Shopify did not return an access token.");
  }

  // Renew a minute early so a token never expires mid-request.
  const lifetime = Math.max(Number(body.expires_in ?? 3600) - 60, 60);
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + lifetime * 1000,
  };
  return tokenCache.token;
}

async function accessToken(): Promise<string> {
  if (config.shopify.adminToken) return config.shopify.adminToken;
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  // Share one in-flight exchange rather than firing several concurrently.
  if (!pendingToken) {
    pendingToken = requestToken().finally(() => {
      pendingToken = null;
    });
  }
  return pendingToken;
}

export interface ShopifyWindow {
  orders: number;
  grossSales: number;
  /** What Shopify has actually recorded as refunded or cancelled so far. */
  recordedReversals: number;
  aov: number;
  daily: Array<{ date: string; orders: number; sales: number }>;
}

interface OrderNode {
  id: string;
  createdAt: string;
  cancelledAt: string | null;
  currentTotalPriceSet: { shopMoney: { amount: string } };
  totalPriceSet: { shopMoney: { amount: string } };
}

const ORDERS_QUERY = `
  query Orders($q: String!, $cursor: String) {
    orders(first: 250, query: $q, after: $cursor, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        createdAt
        cancelledAt
        currentTotalPriceSet {
          shopMoney {
            amount
          }
        }
        totalPriceSet {
          shopMoney {
            amount
          }
        }
      }
    }
  }
`;

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await demoFetch(
    `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": await accessToken(),
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify API ${res.status}: ${body.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(
      `Shopify GraphQL: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!json.data) throw new Error("Shopify returned no data");
  return json.data;
}

interface OrdersResponse {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string };
    nodes: OrderNode[];
  };
}

/** Pull every order in the window, following pagination. */
export async function getSalesWindow(days: number): Promise<ShopifyWindow> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const q = `created_at:>=${since.toISOString().slice(0, 10)}`;

  const nodes: OrderNode[] = [];
  let cursor: string | null = null;

  // Cap the loop so a misconfigured query can never spin forever.
  for (let page = 0; page < 20; page++) {
    const data: OrdersResponse = await shopifyGraphQL(ORDERS_QUERY, {
      q,
      cursor,
    });

    nodes.push(...data.orders.nodes);
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  const byDay = new Map<string, { orders: number; sales: number }>();
  let grossSales = 0;
  let recordedReversals = 0;
  let liveOrders = 0;

  for (const node of nodes) {
    const original = Number(node.totalPriceSet.shopMoney.amount) || 0;
    const current = Number(node.currentTotalPriceSet.shopMoney.amount) || 0;
    const day = node.createdAt.slice(0, 10);

    grossSales += original;
    recordedReversals += Math.max(0, original - current);

    if (!node.cancelledAt) liveOrders += 1;

    const bucket = byDay.get(day) ?? { orders: 0, sales: 0 };
    bucket.orders += 1;
    bucket.sales += original;
    byDay.set(day, bucket);
  }

  return {
    orders: liveOrders,
    grossSales,
    recordedReversals,
    aov: liveOrders ? grossSales / liveOrders : 0,
    daily: [...byDay.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
