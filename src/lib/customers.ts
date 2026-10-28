/**
 * The Customers tab: people worth a WhatsApp message.
 *
 * - Reorder: bought once or more, last order 30–120 days ago, nothing since.
 * - Abandoned: started checkout in the last 3 days and didn't finish.
 *
 * Read-only against Shopify. Phone numbers and names need the read_customers
 * permission (Shopify protected customer data); without it the section says so.
 * Whether someone was messaged is kept in D1 (customer_followups).
 */

import { cairoDay, section, type Section } from "./growth";
import { shopifyGraphQL } from "./shopify";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REORDER_MIN_DAYS = 30;
export const REORDER_MAX_DAYS = 120;
export const ABANDONED_DAYS = 3;

/** Egyptian numbers as WhatsApp wants them: 201XXXXXXXXX. */
export function waNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (digits.startsWith("01") && digits.length === 11) digits = `2${digits}`;
  if (digits.startsWith("1") && digits.length === 10) digits = `20${digits}`;
  return /^201\d{9}$/.test(digits) ? digits : null;
}

export interface ReorderCustomer {
  key: string;
  name: string;
  phone: string | null;
  orders: number;
  totalSpent: number;
  lastOrderRef: string;
  lastOrderDay: string;
  daysSince: number;
  lastItems: string[];
}

export interface AbandonedCheckout {
  key: string;
  name: string;
  phone: string | null;
  createdAt: string;
  total: number;
  items: string[];
  recoveryUrl: string | null;
  province: string | null;
}

interface CustomerOrdersPage {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      name: string;
      createdAt: string;
      cancelledAt: string | null;
      totalPriceSet: { shopMoney: { amount: string } };
      customer: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        defaultPhoneNumber: { phoneNumber: string } | null;
      } | null;
      shippingAddress: { phone: string | null; firstName: string | null } | null;
      lineItems: { nodes: Array<{ title: string }> };
    }>;
  };
}

const CUSTOMER_ORDERS = `
  query CustomerOrders($q: String!, $cursor: String) {
    orders(first: 100, query: $q, after: $cursor, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        createdAt
        cancelledAt
        totalPriceSet { shopMoney { amount } }
        customer { id firstName lastName defaultPhoneNumber { phoneNumber } }
        shippingAddress { phone firstName }
        lineItems(first: 5) { nodes { title } }
      }
    }
  }
`;

function explain(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/access denied|not approved|protected customer data|read_customers/i.test(message)) {
    return new Error(
      "Shopify won't share customer names and phone numbers with the dashboard yet. Give its Shopify app the read_customers permission (and protected customer data access), then reload.",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

export async function getReorderCustomers(): Promise<ReorderCustomer[]> {
  const since = new Date(Date.now() - 365 * DAY_MS).toISOString();
  const nodes: CustomerOrdersPage["orders"]["nodes"] = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; page < 30; page += 1) {
      const data: CustomerOrdersPage = await shopifyGraphQL<CustomerOrdersPage>(CUSTOMER_ORDERS, {
        q: `created_at:>='${since}'`,
        cursor,
      });
      nodes.push(...data.orders.nodes);
      if (!data.orders.pageInfo.hasNextPage) break;
      cursor = data.orders.pageInfo.endCursor;
    }
  } catch (error) {
    throw explain(error);
  }

  const byCustomer = new Map<string, ReorderCustomer & { lastAt: number }>();
  for (const o of nodes) {
    if (o.cancelledAt || !o.customer) continue;
    const at = Date.parse(o.createdAt);
    const known = byCustomer.get(o.customer.id);
    const phone = o.customer.defaultPhoneNumber?.phoneNumber ?? o.shippingAddress?.phone ?? "";
    const name =
      [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ") || o.shippingAddress?.firstName || "Customer";
    const total = Number(o.totalPriceSet.shopMoney.amount) || 0;
    if (!known) {
      byCustomer.set(o.customer.id, {
        key: `reorder:${o.customer.id.split("/").pop()}`,
        name,
        phone: waNumber(phone),
        orders: 1,
        totalSpent: total,
        lastOrderRef: o.name,
        lastOrderDay: cairoDay(o.createdAt),
        daysSince: 0,
        lastItems: o.lineItems.nodes.map((i) => i.title),
        lastAt: at,
      });
      continue;
    }
    known.orders += 1;
    known.totalSpent += total;
    if (at > known.lastAt) {
      Object.assign(known, {
        lastAt: at,
        lastOrderRef: o.name,
        lastOrderDay: cairoDay(o.createdAt),
        lastItems: o.lineItems.nodes.map((i) => i.title),
        name,
        phone: waNumber(phone) ?? known.phone,
      });
    }
  }

  const now = Date.now();
  return [...byCustomer.values()]
    .map(({ lastAt, ...c }) => ({ ...c, daysSince: Math.floor((now - lastAt) / DAY_MS) }))
    .filter((c) => c.daysSince >= REORDER_MIN_DAYS && c.daysSince <= REORDER_MAX_DAYS)
    // Repeat buyers and big spenders first — they're the most likely to come back.
    .sort((a, b) => b.orders - a.orders || b.totalSpent - a.totalSpent);
}

interface AbandonedPage {
  abandonedCheckouts: {
    nodes: Array<{
      id: string;
      createdAt: string;
      completedAt: string | null;
      abandonedCheckoutUrl: string | null;
      totalPriceSet: { shopMoney: { amount: string } };
      customer: { firstName: string | null; defaultPhoneNumber: { phoneNumber: string } | null } | null;
      shippingAddress: { firstName: string | null; phone: string | null; province: string | null } | null;
      lineItems: { nodes: Array<{ title: string; quantity: number }> };
    }>;
  };
}

const ABANDONED = `
  query Abandoned($q: String!) {
    abandonedCheckouts(first: 100, query: $q, reverse: true, sortKey: CREATED_AT) {
      nodes {
        id
        createdAt
        completedAt
        abandonedCheckoutUrl
        totalPriceSet { shopMoney { amount } }
        customer { firstName defaultPhoneNumber { phoneNumber } }
        shippingAddress { firstName phone province }
        lineItems(first: 5) { nodes { title quantity } }
      }
    }
  }
`;

export async function getAbandonedCheckouts(): Promise<AbandonedCheckout[]> {
  const since = new Date(Date.now() - ABANDONED_DAYS * DAY_MS).toISOString();
  let data: AbandonedPage;
  try {
    data = await shopifyGraphQL<AbandonedPage>(ABANDONED, { q: `created_at:>='${since}'` });
  } catch (error) {
    throw explain(error);
  }
  return data.abandonedCheckouts.nodes
    .filter((c) => !c.completedAt)
    .map((c) => ({
      key: `checkout:${c.id.split("/").pop()}`,
      name: c.shippingAddress?.firstName || c.customer?.firstName || "Customer",
      phone: waNumber(c.shippingAddress?.phone ?? c.customer?.defaultPhoneNumber?.phoneNumber ?? ""),
      createdAt: c.createdAt,
      total: Number(c.totalPriceSet.shopMoney.amount) || 0,
      items: c.lineItems.nodes.map((i) => (i.quantity > 1 ? `${i.title} ×${i.quantity}` : i.title)),
      recoveryUrl: c.abandonedCheckoutUrl,
      province: c.shippingAddress?.province ?? null,
    }));
}

export interface CustomersReport {
  generatedAt: string;
  reorder: Section<ReorderCustomer[]>;
  abandoned: Section<AbandonedCheckout[]>;
}

export async function getCustomersReport(): Promise<CustomersReport> {
  const [reorder, abandoned] = await Promise.all([section(getReorderCustomers), section(getAbandonedCheckouts)]);
  return { generatedAt: new Date().toISOString(), reorder, abandoned };
}

// ---------------------------------------------------------------- follow-ups

export interface Followup {
  key: string;
  status: "messaged" | "ordered" | "skip";
  note: string;
  updatedAt: string;
}

export async function getFollowups(db: D1Database): Promise<Followup[]> {
  const { results } = await db
    .prepare("SELECT key, status, note, updated_at FROM customer_followups")
    .all<{ key: string; status: string; note: string | null; updated_at: string }>();
  return results.map((r) => ({
    key: r.key,
    status: r.status === "ordered" || r.status === "skip" ? r.status : "messaged",
    note: r.note ?? "",
    updatedAt: r.updated_at,
  }));
}

export async function saveFollowup(
  db: D1Database,
  entry: { key: string; status: Followup["status"] | "clear"; note: string },
): Promise<void> {
  if (entry.status === "clear") {
    await db.prepare("DELETE FROM customer_followups WHERE key = ?1").bind(entry.key).run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO customer_followups (key, status, note, updated_at) VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = datetime('now')`,
    )
    .bind(entry.key, entry.status, entry.note)
    .run();
}
