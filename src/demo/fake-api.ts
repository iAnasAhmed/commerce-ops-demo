/**
 * Answers the dashboard's calls to Meta, Shopify and Bosta from the demo world.
 * Nothing here can reach the real services.
 *
 * The dashboard's own code is unchanged: it still builds the same requests and
 * runs the same checks on the answers. Only the network is replaced, so every
 * alert, verdict and order issue on screen is the real logic at work on
 * made-up data. Nothing leaves this machine.
 */

import {
  ADS,
  CAMPAIGNS,
  PRODUCTS,
  cairoDay,
  parcelOf,
  rng,
  world,
  type AdDay,
  type Order,
} from "./world";

const DAY = 24 * 3600_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const money = (n: number) => ({ shopMoney: { amount: n.toFixed(2) } });

// ------------------------------------------------------------------ Shopify

const GATEWAY = { cod: ["Cash on Delivery (COD)"], card: ["Paymob"], instapay: ["Instapay"] } as const;

function orderNode(o: Order, now: number) {
  const parcel = parcelOf(o, now);
  const cancelled = o.cancelledAt !== null && o.cancelledAt <= now;
  const code = parcel?.state.code ?? 0;
  const delivered = code === 45;
  const returnedLongAgo = code === 46 && now - Date.parse(parcel!.updatedAt) > 10 * DAY;
  // Shopify records a failed COD order as reversed weeks later, and not always.
  const reversed = !cancelled && returnedLongAgo && rng(`rev:${o.name}`).chance(0.7);
  const current = cancelled || reversed ? 0 : o.total;

  const prepaid = o.payment === "card" || (o.payment === "instapay" && !o.pending);
  const financial = cancelled
    ? prepaid ? "REFUNDED" : "VOIDED"
    : reversed
      ? prepaid ? "REFUNDED" : "VOIDED"
      : prepaid || delivered
        ? "PAID"
        : "PENDING";

  const items = o.items.map((it) => ({
    title: it.title,
    quantity: it.quantity,
    unfulfilledQuantity: parcel ? it.unfulfilled : it.quantity,
    originalTotalSet: money(it.price * it.quantity),
  }));
  const anyUnfulfilled = items.some((it) => it.unfulfilledQuantity > 0);
  const allUnfulfilled = items.every((it) => it.unfulfilledQuantity === it.quantity);

  return {
    id: `gid://shopify/Order/${6100000000 + o.index}`,
    name: o.name,
    createdAt: new Date(o.createdAt).toISOString(),
    cancelledAt: cancelled ? new Date(o.cancelledAt!).toISOString() : null,
    displayFinancialStatus: financial,
    displayFulfillmentStatus: allUnfulfilled ? "UNFULFILLED" : anyUnfulfilled ? "PARTIALLY_FULFILLED" : "FULFILLED",
    paymentGatewayNames: [...GATEWAY[o.payment]],
    totalPriceSet: money(o.total),
    currentTotalPriceSet: money(current),
    totalOutstandingSet: money(financial === "PENDING" ? current : 0),
    totalShippingPriceSet: money(o.shipping),
    totalDiscountsSet: money(o.discount),
    lineItems: { nodes: items },
    customer: {
      id: o.customer.id,
      firstName: o.customer.first,
      lastName: o.customer.last,
      defaultPhoneNumber: { phoneNumber: o.customer.phone },
    },
    shippingAddress: { firstName: o.customer.first, phone: o.customer.phone, province: o.customer.city },
    customerJourneySummary: { lastVisit: { landingPage: o.landingPage }, firstVisit: { landingPage: o.landingPage } },
  };
}

/** Reads `created_at:>='…'` style filters. */
function dateFilter(q: string) {
  let from = -Infinity;
  let to = Infinity;
  for (const m of q.matchAll(/created_at:(>=|<=|>|<)'?([^'\s]+)'?/g)) {
    const t = Date.parse(m[2]);
    if (Number.isNaN(t)) continue;
    if (m[1].startsWith(">")) from = Math.max(from, t);
    else to = Math.min(to, m[1] === "<=" && /^\d{4}-\d{2}-\d{2}$/.test(m[2]) ? t + DAY - 1 : t);
  }
  return (t: number) => t >= from && t <= to;
}

function sessionsFor(orders: number, salt: string) {
  const r = rng(`sessions:${salt}`);
  const sessions = Math.round(orders / (0.019 + r.next() * 0.006));
  return {
    sessions,
    cart: Math.round(sessions * (0.071 + r.next() * 0.02)),
    checkout: Math.round(orders * (1.9 + r.next() * 0.4)),
  };
}

function shopify(body: { query?: string; variables?: Record<string, unknown> }, now: number) {
  const query = body.query ?? "";
  const q = String(body.variables?.q ?? "");
  const w = world(now);
  const placed = w.orders.filter((o) => o.createdAt <= now);

  if (query.includes("currentAppInstallation")) {
    return { data: { currentAppInstallation: { accessScopes: ["read_orders", "read_products", "read_reports"].map((handle) => ({ handle })) } } };
  }

  if (query.includes("shopifyqlQuery")) {
    if (/GROUP BY landing_page_path/.test(q)) {
      const since = now - 14 * DAY;
      const byPage = new Map<string, number>();
      for (const o of placed) if (o.createdAt >= since) {
        const path = new URL(o.landingPage).pathname;
        byPage.set(path, (byPage.get(path) ?? 0) + 1);
      }
      const rows = [...byPage.entries()].map(([path, orders]) => {
        const s = sessionsFor(orders, path);
        return [path, s.sessions, s.cart];
      }).sort((a, b) => Number(b[1]) - Number(a[1]));
      return { data: { shopifyqlQuery: { tableData: { columns: [{ name: "landing_page_path" }, { name: "sessions" }, { name: "sessions_with_cart_additions" }], rows }, parseErrors: null } } };
    }
    const m = q.match(/SINCE (\S+) UNTIL (\S+)/);
    const inRange = m ? dateFilter(`created_at:>='${m[1]}T00:00:00+03:00' created_at:<='${m[2]}T23:59:59+03:00'`) : () => true;
    const orders = placed.filter((o) => inRange(o.createdAt) && !o.cancelledAt).length;
    const s = sessionsFor(orders, m?.[1] ?? "all");
    return {
      data: {
        shopifyqlQuery: {
          tableData: {
            columns: ["sessions", "sessions_with_cart_additions", "sessions_that_reached_checkout", "sessions_that_completed_checkout"].map((name) => ({ name })),
            rows: [[s.sessions, s.cart, s.checkout, orders]],
          },
          parseErrors: null,
        },
      },
    };
  }

  if (query.includes("productVariants")) {
    return {
      data: {
        productVariants: {
          nodes: PRODUCTS.map((p) => ({ title: "Default Title", inventoryQuantity: p.stock, product: { title: p.title } })),
        },
      },
    };
  }

  if (query.includes("abandonedCheckouts")) {
    const inRange = dateFilter(q);
    const nodes = w.abandoned
      .filter((a) => a.createdAt <= now && inRange(a.createdAt))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => ({
        id: a.id,
        createdAt: new Date(a.createdAt).toISOString(),
        completedAt: null,
        abandonedCheckoutUrl: `https://velora-demo.com/checkouts/recover/${a.id.split("/").pop()}`,
        totalPriceSet: money(a.total),
        customer: a.customer.id ? { firstName: a.customer.first, defaultPhoneNumber: { phoneNumber: a.customer.phone } } : null,
        shippingAddress: { firstName: a.customer.first, phone: a.customer.phone, province: a.customer.city },
        lineItems: { nodes: a.items },
      }));
    return { data: { abandonedCheckouts: { nodes } } };
  }

  if (/\borders\s*\(/.test(query)) {
    const inRange = dateFilter(q);
    const reverse = /reverse:\s*true/.test(query);
    const nodes = placed
      .filter((o) => inRange(o.createdAt))
      .sort((a, b) => (reverse ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
      .map((o) => orderNode(o, now));
    return { data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } };
  }

  return { errors: [{ message: "The demo store doesn't answer this query." }] };
}

// ------------------------------------------------------------------ Bosta

function bostaSearch(page: number, limit: number, now: number) {
  const parcels = world(now)
    .orders.map((o) => parcelOf(o, now))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const slice = parcels.slice((page - 1) * limit, page * limit);
  return { data: { deliveries: slice, count: 0 } };
}

function bostaDetail(tracking: string, now: number) {
  const order = world(now).orders.find((o) => o.plan?.tracking === tracking);
  if (!order) return null;
  const parcel = parcelOf(order, now);
  const log: Array<{ time: string; takenBy: { userName: string; userRole: string } }> = [];
  if (parcel?.state.canceled?.time) {
    const by = order.plan?.outcome === "whatsapp_cancel"
      ? { userName: "Whatsapp Bot", userRole: "WHATSAPP_BOT" }
      : { userName: "Hub Supervisor", userRole: "HUB_LEADER" };
    log.push({ time: parcel.state.canceled.time, takenBy: by });
  }
  return {
    data: {
      log,
      paymentInfo: order.plan?.paidAtDoor
        ? { amount: order.total, capturedStatus: "SUCCEEDED", method: "CARD", provider: "Bosta Pay" }
        : null,
    },
  };
}

// ------------------------------------------------------------------ Meta

const fmt = (t: number) => cairoDay(t);

/** Turns a date preset or time range into a list of Cairo days. */
function daysFor(params: URLSearchParams, now: number): string[] {
  const today = fmt(now);
  const back = (n: number) => fmt(now - n * DAY);
  const range = (from: number, to: number) => {
    const out: string[] = [];
    for (let i = from; i >= to; i--) out.push(back(i));
    return out;
  };
  const tr = params.get("time_range");
  if (tr) {
    const { since, until } = JSON.parse(tr) as { since: string; until: string };
    const out: string[] = [];
    for (let t = Date.parse(`${since}T12:00:00Z`); fmt(t) <= until && out.length < 400; t += DAY) out.push(fmt(t));
    return out;
  }
  const preset = params.get("date_preset") ?? "last_30d";
  if (preset === "today") return [today];
  if (preset === "yesterday") return [back(1)];
  if (preset === "this_month") return range(Number(today.slice(8, 10)) - 1, 0);
  const m = preset.match(/^last_(\d+)d$/);
  if (m) return range(Number(m[1]), 1);
  return range(30, 1);
}

const PLATFORMS: Array<[string, number]> = [["instagram", 0.62], ["facebook", 0.33], ["audience_network", 0.05]];
const REGIONS: Array<[string, number]> = [
  ["Cairo Governorate", 0.33], ["Giza Governorate", 0.2], ["Alexandria Governorate", 0.13], ["Qalyubia Governorate", 0.07],
  ["Sharqia Governorate", 0.05], ["Dakahlia Governorate", 0.05], ["Gharbia Governorate", 0.04], ["Red Sea Governorate", 0.03],
  ["Assiut Governorate", 0.03], ["Minya Governorate", 0.03], ["Other", 0.04],
];

function insights(params: URLSearchParams, now: number) {
  const w = world(now);
  const level = params.get("level") ?? "campaign";
  let ids: string[] = CAMPAIGNS.map((c) => c.id);
  try {
    const f = JSON.parse(params.get("filtering") ?? "[]") as Array<{ value?: string[] }>;
    if (f[0]?.value?.length) ids = f[0].value;
  } catch {
    /* use all */
  }
  const days = daysFor(params, now);
  const inc = params.get("time_increment");
  const step = inc === "1" ? 1 : inc === "7" ? 7 : days.length;
  const breakdown = params.get("breakdowns");

  const buckets: string[][] = [];
  for (let i = 0; i < days.length; i += step) buckets.push(days.slice(i, i + step));

  const rows: Record<string, unknown>[] = [];
  const entities = level === "ad"
    ? ADS.filter((a) => ids.includes(a.campaignId)).map((a) => ({ id: a.id, name: a.name, campaign: CAMPAIGNS.find((c) => c.id === a.campaignId)!, ads: [a] }))
    : CAMPAIGNS.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, name: c.name, campaign: c, ads: ADS.filter((a) => a.campaignId === c.id) }));

  for (const bucket of buckets) {
    for (const e of entities) {
      const sum: AdDay = { spend: 0, impressions: 0, reach: 0, clicks: 0, atc: 0, purchases: 0, value: 0 };
      for (const day of bucket) {
        const map = w.adDays.get(day);
        if (!map) continue;
        for (const ad of e.ads) {
          const d = map.get(ad.id);
          if (!d) continue;
          sum.spend += d.spend;
          sum.impressions += d.impressions;
          sum.reach += d.reach * (bucket.length > 1 ? 0.55 : 1);
          sum.clicks += d.clicks;
          sum.atc += d.atc;
          sum.purchases += d.purchases;
          sum.value += d.value;
        }
      }
      // Same-day "today" numbers are partial: scale by how much of the day has passed.
      if (bucket.length === 1 && bucket[0] === fmt(now)) {
        const h = Number(new Date(now).toLocaleString("en-US", { timeZone: "Africa/Cairo", hour12: false, hour: "2-digit" })) % 24;
        const part = Math.max(0.05, h / 24);
        for (const k of Object.keys(sum) as Array<keyof AdDay>) sum[k] = sum[k] * part;
        sum.purchases = Math.round(sum.purchases);
      }
      if (sum.spend === 0) continue;

      const splits: Array<[string | null, number]> = breakdown === "publisher_platform" ? PLATFORMS : breakdown === "region" ? REGIONS : [[null, 1]];
      for (const [label, share] of splits) {
        const s = (n: number) => n * share;
        const purchases = Math.round(s(sum.purchases));
        const spend = s(sum.spend);
        const impressions = Math.round(s(sum.impressions));
        const reach = Math.max(1, Math.round(s(sum.reach)));
        const row: Record<string, unknown> = {
          campaign_id: e.campaign.id,
          campaign_name: e.campaign.name,
          spend: spend.toFixed(2),
          impressions: String(impressions),
          reach: String(reach),
          frequency: (impressions / reach).toFixed(4),
          ctr: impressions ? ((s(sum.clicks) / impressions) * 100).toFixed(4) : "0",
          cpm: impressions ? ((spend / impressions) * 1000).toFixed(4) : "0",
          date_start: bucket[0],
          date_stop: bucket[bucket.length - 1],
          actions: [
            { action_type: "link_click", value: String(Math.round(s(sum.clicks))) },
            { action_type: "omni_add_to_cart", value: String(Math.round(s(sum.atc))) },
            { action_type: "omni_purchase", value: String(purchases) },
          ],
          action_values: [{ action_type: "omni_purchase", value: s(sum.value).toFixed(2) }],
          cost_per_action_type: purchases ? [{ action_type: "omni_purchase", value: (spend / purchases).toFixed(4) }] : [],
          purchase_roas: spend ? [{ action_type: "omni_purchase", value: (s(sum.value) / spend).toFixed(4) }] : [],
        };
        if (level === "ad") {
          row.ad_id = e.id;
          row.ad_name = e.name;
          row.adset_id = e.ads[0].adsetId;
        }
        if (breakdown === "publisher_platform") row.publisher_platform = label;
        if (breakdown === "region") row.region = label;
        rows.push(row);
      }
    }
  }
  return { data: rows };
}

function meta(url: URL, now: number) {
  const path = url.pathname;
  if (path.endsWith("/debug_token")) {
    return { data: { is_valid: true, type: "USER", application: "Velora Ads Dashboard (demo)", scopes: ["ads_read"], expires_at: 0 } };
  }
  if (path.endsWith("/insights")) return insights(url.searchParams, now);
  if (path.endsWith("/campaigns")) {
    return {
      data: CAMPAIGNS.map((c) => ({ id: c.id, name: c.name, effective_status: c.status, daily_budget: String(c.dailyBudget * 100) })),
    };
  }
  if (path.endsWith("/ads")) return { data: ADS.map((a) => ({ id: a.id, adset_id: a.adsetId, campaign_id: a.campaignId })) };
  if (path.endsWith("/activities")) {
    const since = Number(url.searchParams.get("since") ?? 0) * 1000;
    return {
      data: world(now).activities
        .filter((a) => a.time >= since && a.time <= now)
        .map((a) => ({
          event_type: a.type,
          translated_event_type: a.label,
          event_time: new Date(a.time).toISOString(),
          actor_name: a.actor,
          object_id: a.objectId,
          object_name: a.objectName,
          extra_data: JSON.stringify(a.extra),
        })),
    };
  }
  return null;
}

// ------------------------------------------------------------------ entry

/**
 * Used in place of `fetch` by every Meta, Shopify and Bosta call in the app.
 * It never touches the network: anything it doesn't recognise is refused.
 */
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(href);
  const now = Date.now();

  if (url.hostname === "graph.facebook.com") {
    const body = meta(url, now);
    return body ? json(body) : json({ error: { message: "Not in the demo" } }, 404);
  }
  if (url.hostname.endsWith(".myshopify.com")) {
    if (url.pathname.endsWith("/oauth/access_token")) return json({ access_token: "demo", expires_in: 86400 });
    const raw = typeof init?.body === "string" ? init.body : "{}";
    return json(shopify(JSON.parse(raw), now));
  }
  if (url.hostname === "app.bosta.co") {
    if (url.pathname.endsWith("/deliveries/search")) {
      const b = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { page?: number; limit?: number };
      return json(bostaSearch(b.page ?? 1, b.limit ?? 50, now));
    }
    const m = url.pathname.match(/\/deliveries\/business\/([^/]+)$/);
    if (m) {
      const detail = bostaDetail(decodeURIComponent(m[1]), now);
      return detail ? json(detail) : json({ message: "Not found" }, 404);
    }
    return json({ message: "Not in the demo" }, 404);
  }
  return json({ error: { message: `The demo does not call ${url.hostname}` } }, 404);
}
