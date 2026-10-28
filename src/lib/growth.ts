/**
 * The Insights and Test tabs: everything read-only, pulled from Meta, Shopify
 * and Bosta and cross-checked against each other.
 *
 * Each section loads on its own. One failing (a missing scope, a Meta hiccup)
 * returns an error for that section only, so the rest of the page still works.
 */

import { searchRecentDeliveries, type BostaDelivery } from "./bosta";
import { config } from "./config";
import { AB_TEST, ALL_COSMETICS_CAMPAIGNS } from "./ab-test";
import { fetchInsights, graphUrl, type MetaInsight } from "./meta";
import { shopifyGraphQL } from "./shopify";
import { demoFetch } from "@/demo/fake-api";

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export async function section<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load" };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DELIVERED = 45;
const RETURNED = 46;
const TERMINATED = 48;

const cairoFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" });
/** The calendar day in Cairo, as YYYY-MM-DD. */
export const cairoDay = (value: string | number | Date) => cairoFormat.format(new Date(value));
const daysAgo = (n: number) => cairoDay(Date.now() - n * DAY_MS);
const refOf = (d: BostaDelivery) => (d.businessReference ?? "").replace(/^.*:/, "");
const money = (m: { shopMoney: { amount: string } }) => Number(m.shopMoney.amount) || 0;

/** "Cairo Governorate" and Bosta's "Cairo" should land in one row. */
export const cleanRegion = (name: string) =>
  name.replace(/\s+Governorate$/i, "").replace(/^Al\s+/i, "").trim() || "Unknown";

// ---------------------------------------------------------------- Shopify

export interface GrowthOrder {
  name: string;
  createdAt: string;
  day: string;
  cancelled: boolean;
  total: number;
  paymentGateways: string[];
  items: Array<{ title: string; quantity: number }>;
  landingPage: string | null;
}

interface OrdersPage {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      name: string;
      createdAt: string;
      cancelledAt: string | null;
      paymentGatewayNames: string[];
      totalPriceSet: { shopMoney: { amount: string } };
      lineItems: { nodes: Array<{ title: string; quantity: number }> };
      customerJourneySummary: {
        lastVisit: { landingPage: string | null } | null;
        firstVisit: { landingPage: string | null } | null;
      } | null;
    }>;
  };
}

const GROWTH_ORDERS = `
  query GrowthOrders($q: String!, $cursor: String) {
    orders(first: 100, query: $q, after: $cursor, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        createdAt
        cancelledAt
        paymentGatewayNames
        totalPriceSet { shopMoney { amount } }
        lineItems(first: 10) { nodes { title quantity } }
        customerJourneySummary {
          lastVisit { landingPage }
          firstVisit { landingPage }
        }
      }
    }
  }
`;

export async function getOrdersSince(days: number): Promise<GrowthOrder[]> {
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const out: GrowthOrder[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 15; page += 1) {
    const data: OrdersPage = await shopifyGraphQL<OrdersPage>(GROWTH_ORDERS, {
      q: `created_at:>='${since}'`,
      cursor,
    });
    for (const o of data.orders.nodes) {
      const visit = o.customerJourneySummary?.lastVisit ?? o.customerJourneySummary?.firstVisit;
      out.push({
        name: o.name,
        createdAt: o.createdAt,
        day: cairoDay(o.createdAt),
        cancelled: Boolean(o.cancelledAt),
        total: money(o.totalPriceSet),
        paymentGateways: o.paymentGatewayNames,
        items: o.lineItems.nodes,
        landingPage: visit?.landingPage ?? null,
      });
    }
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }
  return out;
}

// ---------------------------------------------------------------- Bosta

export type ParcelOutcome = "delivered" | "failed" | "open";

export function outcomeOf(d: BostaDelivery): ParcelOutcome {
  const code = d.state?.code;
  if (code === DELIVERED) return "delivered";
  if (code === RETURNED || code === TERMINATED || d.state?.canceled?.time) return "failed";
  return "open";
}

/** The latest Send parcel per order ref. */
export function sendsByRef(parcels: BostaDelivery[]): Map<string, BostaDelivery> {
  const byRef = new Map<string, BostaDelivery>();
  for (const p of parcels) {
    if (p.type?.value !== "Send") continue;
    const ref = refOf(p);
    const known = byRef.get(ref);
    if (ref && (!known || (p.createdAt ?? "") > (known.createdAt ?? ""))) byRef.set(ref, p);
  }
  return byRef;
}

// ---------------------------------------------------------------- 2. Meta vs real orders

export interface TruthDay {
  day: string;
  spend: number;
  metaPurchases: number;
  shopifyOrders: number;
  delivered: number;
  failed: number;
  open: number;
}

export async function getTruth(
  orders: GrowthOrder[],
  parcels: Map<string, BostaDelivery>,
  days = 14,
): Promise<TruthDay[]> {
  const since = daysAgo(days - 1);
  const meta = await fetchInsights(
    "campaign",
    { time_range: JSON.stringify({ since, until: cairoDay(Date.now()) }), time_increment: "1" },
    ALL_COSMETICS_CAMPAIGNS,
  );

  const rows = new Map<string, TruthDay>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = daysAgo(i);
    rows.set(day, { day, spend: 0, metaPurchases: 0, shopifyOrders: 0, delivered: 0, failed: 0, open: 0 });
  }
  for (const m of meta) {
    const row = m.dateStart ? rows.get(m.dateStart) : undefined;
    if (!row) continue;
    row.spend += m.spend;
    row.metaPurchases += m.purchases;
  }
  for (const o of orders) {
    const row = rows.get(o.day);
    if (!row || o.cancelled) continue;
    row.shopifyOrders += 1;
    const parcel = parcels.get(o.name);
    row[parcel ? outcomeOf(parcel) : "open"] += 1;
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------- 3. Failed deliveries

export interface FailRow {
  name: string;
  delivered: number;
  failed: number;
  rate: number;
}

export interface DeliveryWatch {
  windowDays: number;
  /** The oldest parcel actually read — Bosta search is capped at 1,000 parcels. */
  since: string | null;
  delivered: number;
  failed: number;
  rate: number;
  byCity: FailRow[];
  byProduct: FailRow[];
}

function tally(map: Map<string, { delivered: number; failed: number }>, minTotal: number): FailRow[] {
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, rate: v.failed / (v.delivered + v.failed) }))
    .filter((r) => r.delivered + r.failed >= minTotal)
    .sort((a, b) => b.failed - a.failed || b.rate - a.rate);
}

export function getDeliveryWatch(
  orders: GrowthOrder[],
  parcels: BostaDelivery[],
  windowDays: number,
): DeliveryWatch {
  const itemsByRef = new Map(orders.map((o) => [o.name, o.items]));
  const city = new Map<string, { delivered: number; failed: number }>();
  const product = new Map<string, { delivered: number; failed: number }>();
  let delivered = 0;
  let failed = 0;
  const cutoff = Date.now() - windowDays * DAY_MS;
  const recent = parcels.filter((p) => p.createdAt && Date.parse(p.createdAt) >= cutoff);
  const since = recent.reduce<string | null>(
    (min, p) => (!min || (p.createdAt ?? "") < min ? (p.createdAt ?? min) : min),
    null,
  );

  for (const p of sendsByRef(recent).values()) {
    const outcome = outcomeOf(p);
    if (outcome === "open") continue;
    // A cancelled order that never left isn't a delivery failure.
    if (p.state?.canceled?.time && !(p.state?.exception ?? []).length && p.state?.code !== RETURNED) continue;
    if (outcome === "delivered") delivered += 1;
    else failed += 1;

    const c = cleanRegion(p.dropOffAddress?.city?.name ?? "Unknown");
    const cRow = city.get(c) ?? { delivered: 0, failed: 0 };
    cRow[outcome] += 1;
    city.set(c, cRow);

    for (const item of itemsByRef.get(refOf(p)) ?? []) {
      const pRow = product.get(item.title) ?? { delivered: 0, failed: 0 };
      pRow[outcome] += 1;
      product.set(item.title, pRow);
    }
  }

  return {
    windowDays,
    since: since ? cairoDay(since) : null,
    delivered,
    failed,
    rate: delivered + failed ? failed / (delivered + failed) : 0,
    byCity: tally(city, 3),
    byProduct: tally(product, 3),
  };
}

// ---------------------------------------------------------------- 8. Ad fatigue

export interface FatigueRow {
  id: string;
  name: string;
  campaignName: string;
  spend: number;
  frequency: number;
  frequencyBefore: number;
  ctr: number;
  ctrBefore: number;
  cpp: number;
  cppBefore: number;
  signals: string[];
}

export async function getFatigue(): Promise<FatigueRow[]> {
  const now = Date.now();
  const range = (from: number, to: number) =>
    JSON.stringify({ since: cairoDay(now - from * DAY_MS), until: cairoDay(now - to * DAY_MS) });
  const [recent, before] = await Promise.all([
    fetchInsights("ad", { time_range: range(7, 1) }, ALL_COSMETICS_CAMPAIGNS),
    fetchInsights("ad", { time_range: range(14, 8) }, ALL_COSMETICS_CAMPAIGNS),
  ]);
  const prior = new Map(before.map((r) => [r.id, r]));

  return recent
    .filter((r) => r.spend >= 300)
    .map((r) => {
      const p = prior.get(r.id);
      const signals: string[] = [];
      if (r.frequency >= config.thresholds.frequencyCeiling) {
        signals.push(`Seen ${r.frequency.toFixed(1)}× per person this week`);
      }
      if (p && p.ctr > 0 && r.ctr < p.ctr * 0.8) {
        signals.push(`Click rate down ${Math.round((1 - r.ctr / p.ctr) * 100)}% on last week`);
      }
      if (p && p.cpp > 0 && r.cpp > p.cpp * 1.3) {
        signals.push(`Cost per purchase up ${Math.round((r.cpp / p.cpp - 1) * 100)}% on last week`);
      }
      if (p && p.frequency > 0 && r.frequency > p.frequency * 1.25 && r.frequency >= 2) {
        signals.push("Frequency climbing fast");
      }
      return {
        id: r.id,
        name: r.name,
        campaignName: r.campaignName ?? "",
        spend: r.spend,
        frequency: r.frequency,
        frequencyBefore: p?.frequency ?? 0,
        ctr: r.ctr,
        ctrBefore: p?.ctr ?? 0,
        cpp: r.cpp,
        cppBefore: p?.cpp ?? 0,
        signals,
      };
    })
    .sort((a, b) => b.signals.length - a.signals.length || b.spend - a.spend);
}

// ---------------------------------------------------------------- 9. Change log

export interface ChangeEvent {
  time: string;
  day: string;
  actor: string;
  objectName: string;
  event: string;
  detail: string;
}

export interface ChangeLog {
  events: ChangeEvent[];
  days: Array<{ day: string; orders: number; spend: number; changes: number }>;
}

interface RawActivity {
  event_type?: string;
  translated_event_type?: string;
  event_time?: string;
  actor_name?: string;
  object_id?: string;
  object_name?: string;
  extra_data?: string;
}

function describe(extra: string | undefined): string {
  if (!extra) return "";
  try {
    const data = JSON.parse(extra) as { old_value?: unknown; new_value?: unknown; type?: string };
    const show = (v: unknown) => {
      if (v && typeof v === "object" && "new_value" in (v as object)) {
        const inner = v as { new_value?: number; old_value?: number; currency?: string };
        const n = inner.new_value ?? inner.old_value;
        return typeof n === "number" ? `EGP ${(n / 100).toLocaleString("en-US")}` : "";
      }
      if (v && typeof v === "object" && "old_value" in (v as object)) {
        const n = (v as { old_value?: number }).old_value;
        return typeof n === "number" ? `EGP ${(n / 100).toLocaleString("en-US")}` : "";
      }
      return typeof v === "string" || typeof v === "number" ? String(v) : "";
    };
    const from = show(data.old_value);
    const to = show(data.new_value);
    if (from && to) return `${from} → ${to}`;
    return to || from;
  } catch {
    return "";
  }
}

async function cosmeticsObjectIds(): Promise<Set<string>> {
  const ids = new Set<string>(ALL_COSMETICS_CAMPAIGNS);
  const url = graphUrl(`act_${config.meta.adAccountId}/ads`, {
    fields: "id,adset_id,campaign_id",
    limit: "500",
    filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: ALL_COSMETICS_CAMPAIGNS }]),
  });
  const res = await demoFetch(url, { cache: "no-store" });
  if (!res.ok) return ids;
  const json = (await res.json()) as { data?: Array<{ id: string; adset_id?: string }> };
  for (const ad of json.data ?? []) {
    ids.add(ad.id);
    if (ad.adset_id) ids.add(ad.adset_id);
  }
  return ids;
}

export async function getChangeLog(orders: GrowthOrder[], truth: TruthDay[] | null): Promise<ChangeLog> {
  const since = Math.floor((Date.now() - 14 * DAY_MS) / 1000);
  const [ids, res] = await Promise.all([
    cosmeticsObjectIds(),
    demoFetch(
      graphUrl(`act_${config.meta.adAccountId}/activities`, {
        fields: "event_type,translated_event_type,event_time,actor_name,object_id,object_name,extra_data",
        since: String(since),
        limit: "300",
      }),
      { cache: "no-store" },
    ),
  ]);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta activity log ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: RawActivity[] };

  const IGNORED = /ad_review|create_ad$|add_images|update_ad_creative|delivery/i;
  const events = (json.data ?? [])
    .filter((a) => a.object_id && ids.has(a.object_id) && !IGNORED.test(a.event_type ?? ""))
    .map((a) => ({
      time: a.event_time ?? "",
      day: cairoDay(a.event_time ?? Date.now()),
      actor: a.actor_name ?? "",
      objectName: a.object_name ?? "",
      event: a.translated_event_type ?? (a.event_type ?? "").replace(/_/g, " "),
      detail: describe(a.extra_data),
    }));

  const days = new Map<string, { day: string; orders: number; spend: number; changes: number }>();
  for (let i = 13; i >= 0; i -= 1) {
    const day = daysAgo(i);
    days.set(day, { day, orders: 0, spend: 0, changes: 0 });
  }
  for (const o of orders) if (!o.cancelled && days.has(o.day)) days.get(o.day)!.orders += 1;
  for (const t of truth ?? []) if (days.has(t.day)) days.get(t.day)!.spend = t.spend;
  for (const e of events) if (days.has(e.day)) days.get(e.day)!.changes += 1;

  return { events, days: [...days.values()] };
}

// ---------------------------------------------------------------- 10. Landing pages

export interface LandingRow {
  page: string;
  sessions: number | null;
  cartSessions: number | null;
  cartRate: number | null;
  orders: number;
}

export interface LandingReport {
  source: "sessions" | "orders";
  note: string | null;
  rows: LandingRow[];
}

const pathOf = (url: string) => {
  try {
    return new URL(url, "https://velora-demo.com").pathname.replace(/\/$/, "") || "/";
  } catch {
    return url;
  }
};

export async function getLandingPages(orders: GrowthOrder[]): Promise<LandingReport> {
  const since = daysAgo(13);
  const ordersByPage = new Map<string, number>();
  for (const o of orders) {
    if (o.cancelled || o.day < since) continue;
    const page = o.landingPage ? pathOf(o.landingPage) : "Unknown";
    ordersByPage.set(page, (ordersByPage.get(page) ?? 0) + 1);
  }

  try {
    const data = await shopifyGraphQL<{
      shopifyqlQuery: { tableData: { columns: Array<{ name: string }>; rows: unknown[] } | null; parseErrors: unknown };
    }>(
      `query Q($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name } rows } parseErrors } }`,
      {
        q: `FROM sessions SHOW sessions, sessions_with_cart_additions GROUP BY landing_page_path SINCE -14d UNTIL today ORDER BY sessions DESC LIMIT 15`,
      },
    );
    const table = data.shopifyqlQuery.tableData;
    if (!table) throw new Error("No table returned");
    const cols = table.columns.map((c) => c.name);
    const at = (row: unknown, name: string) =>
      Array.isArray(row) ? row[cols.indexOf(name)] : (row as Record<string, unknown>)[name];
    const rows = table.rows.map((row) => {
      const page = pathOf(String(at(row, "landing_page_path") ?? ""));
      const sessions = Number(at(row, "sessions")) || 0;
      const cart = Number(at(row, "sessions_with_cart_additions")) || 0;
      return { page, sessions, cartSessions: cart, cartRate: sessions ? cart / sessions : 0, orders: ordersByPage.get(page) ?? 0 };
    });
    return { source: "sessions", note: null, rows };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    return {
      source: "orders",
      note: /access|scope|denied/i.test(reason)
        ? "Visit counts need the read_reports permission on the dashboard's Shopify app. Showing orders by landing page instead."
        : "Visit counts couldn't be read from Shopify. Showing orders by landing page instead.",
      rows: [...ordersByPage.entries()]
        .map(([page, n]) => ({ page, sessions: null, cartSessions: null, cartRate: null, orders: n }))
        .sort((a, b) => b.orders - a.orders)
        .slice(0, 15),
    };
  }
}

// ---------------------------------------------------------------- 11. Stock

export interface StockRow {
  product: string;
  variant: string;
  quantity: number;
  soldLast14: number;
  daysLeft: number | null;
}

export async function getStock(orders: GrowthOrder[]): Promise<StockRow[]> {
  const data = await shopifyGraphQL<{
    productVariants: {
      nodes: Array<{ title: string; inventoryQuantity: number | null; product: { title: string } }>;
    };
  }>(
    `query Stock { productVariants(first: 250, query: "product_status:active") { nodes { title inventoryQuantity product { title } } } }`,
    {},
  );

  const since = daysAgo(13);
  const sold = new Map<string, number>();
  for (const o of orders) {
    if (o.cancelled || o.day < since) continue;
    for (const item of o.items) sold.set(item.title, (sold.get(item.title) ?? 0) + item.quantity);
  }

  return data.productVariants.nodes
    .filter((v) => v.inventoryQuantity !== null)
    .map((v) => {
      const units = sold.get(v.product.title) ?? 0;
      const perDay = units / 14;
      const quantity = v.inventoryQuantity ?? 0;
      return {
        product: v.product.title,
        variant: v.title === "Default Title" ? "" : v.title,
        quantity,
        soldLast14: units,
        daysLeft: perDay > 0 ? Math.floor(quantity / perDay) : null,
      };
    })
    .filter((r) => r.quantity <= 10 || (r.daysLeft !== null && r.daysLeft <= 14))
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999) || a.quantity - b.quantity);
}

// ---------------------------------------------------------------- 6. A/B test

export interface CellStats {
  key: "A" | "B";
  label: string;
  campaignId: string;
  spend: number;
  purchases: number;
  cpp: number;
  addToCart: number;
  linkClicks: number;
  cpm: number;
  frequency: number;
  daily: Array<{ day: string; spend: number; purchases: number }>;
  platforms: Array<{ name: string; spend: number; purchases: number; addToCart: number }>;
  regions: Array<{ name: string; spend: number; purchases: number; linkClicks: number }>;
}

export interface AbTestReport {
  name: string;
  studyId: string;
  start: string;
  end: string;
  decisionDate: string;
  day: number;
  totalDays: number;
  cells: CellStats[];
  shopify: { orders: number; delivered: number; failed: number; open: number };
  ordersByRegion: Array<{ name: string; orders: number; delivered: number }>;
  checkpoint: string;
}

function roll(rows: MetaInsight[]) {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const purchases = rows.reduce((s, r) => s + r.purchases, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  return {
    spend,
    purchases,
    addToCart: rows.reduce((s, r) => s + (r.addToCart ?? 0), 0),
    linkClicks: rows.reduce((s, r) => s + (r.linkClicks ?? 0), 0),
    impressions,
  };
}

export async function getAbTest(orders: GrowthOrder[], parcels: Map<string, BostaDelivery>): Promise<AbTestReport> {
  const until = cairoDay(Date.now()) < AB_TEST.end ? cairoDay(Date.now()) : AB_TEST.end;
  const range = JSON.stringify({ since: AB_TEST.start, until });
  const ids = AB_TEST.cells.map((c) => c.campaignId);

  const [totals, daily, platforms, regions] = await Promise.all([
    fetchInsights("campaign", { time_range: range }, ids),
    fetchInsights("campaign", { time_range: range, time_increment: "1" }, ids),
    fetchInsights("campaign", { time_range: range, breakdowns: "publisher_platform" }, ids),
    fetchInsights("campaign", { time_range: range, breakdowns: "region" }, ids),
  ]);

  const cells: CellStats[] = AB_TEST.cells.map((cell) => {
    const t = totals.find((r) => r.id === cell.campaignId);
    const sum = roll(t ? [t] : []);
    return {
      key: cell.key,
      label: cell.label,
      campaignId: cell.campaignId,
      spend: sum.spend,
      purchases: sum.purchases,
      cpp: sum.purchases ? sum.spend / sum.purchases : 0,
      addToCart: sum.addToCart,
      linkClicks: sum.linkClicks,
      cpm: t?.cpm ?? 0,
      frequency: t?.frequency ?? 0,
      daily: daily
        .filter((r) => r.id === cell.campaignId)
        .map((r) => ({ day: r.dateStart ?? "", spend: r.spend, purchases: r.purchases }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      platforms: platforms
        .filter((r) => r.id === cell.campaignId)
        .map((r) => ({ name: r.breakdown ?? "", spend: r.spend, purchases: r.purchases, addToCart: r.addToCart ?? 0 })),
      regions: regions
        .filter((r) => r.id === cell.campaignId && r.spend > 0)
        .map((r) => ({
          name: cleanRegion(r.breakdown ?? ""),
          spend: r.spend,
          purchases: r.purchases,
          linkClicks: r.linkClicks ?? 0,
        }))
        .sort((a, b) => b.spend - a.spend),
    };
  });

  const inTest = orders.filter((o) => !o.cancelled && o.day >= AB_TEST.start && o.day <= AB_TEST.end);
  const shopify = { orders: inTest.length, delivered: 0, failed: 0, open: 0 };
  const regionMap = new Map<string, { orders: number; delivered: number }>();
  for (const o of inTest) {
    const parcel = parcels.get(o.name);
    const outcome = parcel ? outcomeOf(parcel) : "open";
    shopify[outcome] += 1;
    const region = cleanRegion(parcel?.dropOffAddress?.city?.name ?? "No Bosta parcel yet");
    const row = regionMap.get(region) ?? { orders: 0, delivered: 0 };
    row.orders += 1;
    if (outcome === "delivered") row.delivered += 1;
    regionMap.set(region, row);
  }

  const totalDays = Math.round((Date.parse(AB_TEST.end) - Date.parse(AB_TEST.start)) / DAY_MS) + 1;
  const day = Math.min(
    totalDays,
    Math.max(0, Math.round((Date.parse(cairoDay(Date.now())) - Date.parse(AB_TEST.start)) / DAY_MS) + 1),
  );

  const b = cells.find((c) => c.key === "B");
  const checkpoint =
    day < 4
      ? "Too early to judge. B is still learning — no edits."
      : b && b.purchases === 0 && b.spend >= 3000
        ? "B has spent over EGP 3,000 with no purchases. Consider ending the test early and moving B's budget back to A."
        : "Keep running. Judge on the decision date with Shopify and Bosta delivered orders.";

  return {
    name: AB_TEST.name,
    studyId: AB_TEST.studyId,
    start: AB_TEST.start,
    end: AB_TEST.end,
    decisionDate: AB_TEST.decisionDate,
    day,
    totalDays,
    cells,
    shopify,
    ordersByRegion: [...regionMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((x, y) => y.orders - x.orders),
    checkpoint,
  };
}

// ---------------------------------------------------------------- everything

export interface GrowthReport {
  generatedAt: string;
  truth: Section<TruthDay[]>;
  deliveries: Section<DeliveryWatch>;
  fatigue: Section<FatigueRow[]>;
  changes: Section<ChangeLog>;
  landing: Section<LandingReport>;
  stock: Section<StockRow[]>;
  abTest: Section<AbTestReport>;
}

const DELIVERY_WINDOW_DAYS = 45;

export async function getGrowthReport(): Promise<GrowthReport> {
  const [ordersR, parcelsR] = await Promise.all([
    section(() => getOrdersSince(DELIVERY_WINDOW_DAYS + 7)),
    section(() => searchRecentDeliveries(DELIVERY_WINDOW_DAYS + 14)),
  ]);
  const orders = ordersR.ok ? ordersR.data : [];
  const parcelList = parcelsR.ok ? parcelsR.data : [];
  const parcels = sendsByRef(parcelList);
  const needs = (...rs: Array<Section<unknown>>) => {
    const failed = rs.find((r) => !r.ok) as { ok: false; error: string } | undefined;
    if (failed) throw new Error(failed.error);
  };

  const truth = await section(async () => {
    needs(ordersR);
    return getTruth(orders, parcels);
  });

  const [deliveries, fatigue, changes, landing, stock, abTest] = await Promise.all([
    section(async () => {
      needs(ordersR, parcelsR);
      return getDeliveryWatch(orders, parcelList, DELIVERY_WINDOW_DAYS);
    }),
    section(getFatigue),
    section(async () => {
      needs(ordersR);
      return getChangeLog(orders, truth.ok ? truth.data : null);
    }),
    section(async () => {
      needs(ordersR);
      return getLandingPages(orders);
    }),
    section(async () => {
      needs(ordersR);
      return getStock(orders);
    }),
    section(async () => {
      needs(ordersR);
      return getAbTest(orders, parcels);
    }),
  ]);

  return { generatedAt: new Date().toISOString(), truth, deliveries, fatigue, changes, landing, stock, abTest };
}
