/**
 * Month so far — the numbers a brand keeps in its monthly sales sheet, computed
 * live instead of by hand.
 *
 * The sheet's monthly block is: ads spend, website sales, shipping charges
 * deducted, failed-delivery items, net sales after both, Instagram/DM net
 * sales, net sales overall, and MER. Plus the Shopify funnel and the product
 * table. This rebuilds all of it for the current month, with the same month
 * last period alongside so the trend is visible.
 *
 * Ad spend never leaves this module for a client or support caller — the API
 * route strips it. See `MonthReport.ads`.
 */

import { searchRecentDeliveries, type BostaDelivery } from "./bosta";
import { config } from "./config";
import { cairoDay, outcomeOf, sendsByRef } from "./growth";
import { ALL_COSMETICS_CAMPAIGNS } from "./ab-test";
import { fetchInsights } from "./meta";
import { shopifyGraphQL } from "./shopify";


/** First day of the current month in Cairo, as YYYY-MM-DD. */
export function monthStart(offsetMonths = 0): string {
  const today = cairoDay(Date.now());
  const [y, m] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  return date.toISOString().slice(0, 10);
}

export function monthEnd(offsetMonths = 0): string {
  const [y, m] = monthStart(offsetMonths).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const monthName = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

// ---------------------------------------------------------------- Shopify

interface MonthOrderNode {
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  paymentGatewayNames: string[];
  totalPriceSet: { shopMoney: { amount: string } };
  currentTotalPriceSet: { shopMoney: { amount: string } };
  totalShippingPriceSet: { shopMoney: { amount: string } };
  totalDiscountsSet: { shopMoney: { amount: string } };
  lineItems: { nodes: Array<{ title: string; quantity: number; originalTotalSet: { shopMoney: { amount: string } } }> };
}

const MONTH_ORDERS = `
  query MonthOrders($q: String!, $cursor: String) {
    orders(first: 100, query: $q, after: $cursor, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        paymentGatewayNames
        totalPriceSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        lineItems(first: 20) {
          nodes { title quantity originalTotalSet { shopMoney { amount } } }
        }
      }
    }
  }
`;

const money = (m?: { shopMoney: { amount: string } }) => Number(m?.shopMoney.amount) || 0;

async function ordersBetween(since: string, until: string): Promise<MonthOrderNode[]> {
  const q = `created_at:>='${since}T00:00:00+03:00' created_at:<='${until}T23:59:59+03:00'`;
  const out: MonthOrderNode[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 15; page += 1) {
    const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: MonthOrderNode[] } } =
      await shopifyGraphQL(MONTH_ORDERS, { q, cursor });
    out.push(...data.orders.nodes);
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }
  return out;
}

// ---------------------------------------------------------------- shapes

export interface ProductRow {
  title: string;
  units: number;
  orders: number;
  sales: number;
  averagePerOrder: number;
}

export interface DayRow {
  day: string;
  orders: number;
  sales: number;
}

export interface MonthTotals {
  label: string;
  since: string;
  until: string;
  /** Orders placed, cancelled ones excluded. */
  orders: number;
  /** Everything the store billed, before anything is taken off. */
  grossSales: number;
  discounts: number;
  shipping: number;
  /** Bosta parcels for this month's orders that came back or were refused. */
  failedOrders: number;
  failedValue: number;
  deliveredOrders: number;
  openOrders: number;
  /** Gross − shipping − failed. The sheet's "net sales overall". */
  netSales: number;
  averageOrderValue: number;
  /** Orders whose payment came through a DM / Instapay route, like the sheet's Instagram line. */
  dmOrders: number;
  dmSales: number;
  daily: DayRow[];
  products: ProductRow[];
}

export interface FunnelTotals {
  sessions: number | null;
  addedToCart: number | null;
  reachedCheckout: number | null;
  completedCheckout: number | null;
  conversionRate: number | null;
  note: string | null;
}

export interface MonthReport {
  generatedAt: string;
  today: string;
  /** How far through the month we are, for honest pace comparisons. */
  dayOfMonth: number;
  daysInMonth: number;
  current: MonthTotals;
  previous: MonthTotals;
  /** Same slice of last month (1st → same day), so a part-month isn't compared to a whole one. */
  previousToDate: MonthTotals;
  funnel: FunnelTotals;
  /** Owner-only. Stripped from the payload for client and support callers. */
  ads: { spend: number; purchases: number; costPerPurchase: number; mer: number } | null;
}

// ---------------------------------------------------------------- build

function summarise(
  label: string,
  since: string,
  until: string,
  orders: MonthOrderNode[],
  parcels: Map<string, BostaDelivery>,
): MonthTotals {
  const live = orders.filter((o) => !o.cancelledAt);

  let grossSales = 0;
  let discounts = 0;
  let shipping = 0;
  let failedOrders = 0;
  let failedValue = 0;
  let deliveredOrders = 0;
  let openOrders = 0;
  let dmOrders = 0;
  let dmSales = 0;

  const byDay = new Map<string, DayRow>();
  const byProduct = new Map<string, { units: number; orders: number; sales: number }>();

  for (const order of live) {
    const total = money(order.totalPriceSet);
    const day = cairoDay(order.createdAt);

    grossSales += total;
    discounts += money(order.totalDiscountsSet);
    shipping += money(order.totalShippingPriceSet);

    const gateways = order.paymentGatewayNames.join(" ").toLowerCase();
    if (gateways.includes("instapay") || gateways.includes("manual")) {
      dmOrders += 1;
      dmSales += total;
    }

    const parcel = parcels.get(order.name);
    const outcome = parcel ? outcomeOf(parcel) : "open";
    if (outcome === "delivered") deliveredOrders += 1;
    else if (outcome === "failed") {
      failedOrders += 1;
      failedValue += total;
    } else openOrders += 1;

    const dayRow = byDay.get(day) ?? { day, orders: 0, sales: 0 };
    dayRow.orders += 1;
    dayRow.sales += total;
    byDay.set(day, dayRow);

    for (const item of order.lineItems.nodes) {
      const row = byProduct.get(item.title) ?? { units: 0, orders: 0, sales: 0 };
      row.units += item.quantity;
      row.orders += 1;
      row.sales += money(item.originalTotalSet);
      byProduct.set(item.title, row);
    }
  }

  return {
    label,
    since,
    until,
    orders: live.length,
    grossSales,
    discounts,
    shipping,
    failedOrders,
    failedValue,
    deliveredOrders,
    openOrders,
    netSales: grossSales - shipping - failedValue,
    averageOrderValue: live.length ? grossSales / live.length : 0,
    dmOrders,
    dmSales,
    daily: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    products: [...byProduct.entries()]
      .map(([title, v]) => ({ title, ...v, averagePerOrder: v.orders ? v.sales / v.orders : 0 }))
      .sort((a, b) => b.sales - a.sales),
  };
}

async function funnel(since: string, until: string): Promise<FunnelTotals> {
  try {
    const data = await shopifyGraphQL<{
      shopifyqlQuery: { tableData: { columns: Array<{ name: string }>; rows: unknown[] } | null };
    }>(`query Q($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name } rows } } }`, {
      q: `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout SINCE ${since} UNTIL ${until}`,
    });
    const table = data.shopifyqlQuery.tableData;
    if (!table?.rows.length) throw new Error("No rows");
    const cols = table.columns.map((c) => c.name);
    const row = table.rows[0];
    const at = (name: string) =>
      Number(Array.isArray(row) ? row[cols.indexOf(name)] : (row as Record<string, unknown>)[name]) || 0;
    const sessions = at("sessions");
    return {
      sessions,
      addedToCart: at("sessions_with_cart_additions"),
      reachedCheckout: at("sessions_that_reached_checkout"),
      completedCheckout: at("sessions_that_completed_checkout"),
      conversionRate: sessions ? at("sessions_that_completed_checkout") / sessions : null,
      note: null,
    };
  } catch {
    return {
      sessions: null,
      addedToCart: null,
      reachedCheckout: null,
      completedCheckout: null,
      conversionRate: null,
      note: "Visit numbers need the read_reports permission on the Shopify app.",
    };
  }
}

async function adTotals(since: string, until: string) {
  if (!config.meta.accessToken) return null;
  try {
    const rows = await fetchInsights(
      "campaign",
      { time_range: JSON.stringify({ since, until }) },
      ALL_COSMETICS_CAMPAIGNS,
    );
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const purchases = rows.reduce((s, r) => s + r.purchases, 0);
    return { spend, purchases, costPerPurchase: purchases ? spend / purchases : 0, mer: 0 };
  } catch {
    return null;
  }
}

export async function getMonthReport(): Promise<MonthReport> {
  const today = cairoDay(Date.now());
  const thisStart = monthStart(0);
  const lastStart = monthStart(-1);
  const lastEnd = monthEnd(-1);
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = Number(monthEnd(0).slice(8, 10));

  /** Same day-of-month last month, so a part-month is compared like for like. */
  const lastToDateEnd = (() => {
    const [y, m] = lastStart.split("-").map(Number);
    const lastDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = Math.min(dayOfMonth, lastDays);
    return `${lastStart.slice(0, 8)}${String(d).padStart(2, "0")}`;
  })();

  const [thisOrders, lastOrders, parcelList, funnelData, ads] = await Promise.all([
    ordersBetween(thisStart, today),
    ordersBetween(lastStart, lastEnd),
    searchRecentDeliveries(70).catch(() => [] as BostaDelivery[]),
    funnel(thisStart, today),
    adTotals(thisStart, today),
  ]);

  const parcels = sendsByRef(parcelList);
  const current = summarise(monthName(thisStart), thisStart, today, thisOrders, parcels);
  const previous = summarise(monthName(lastStart), lastStart, lastEnd, lastOrders, parcels);
  const previousToDate = summarise(
    `${monthName(lastStart)} (to day ${dayOfMonth})`,
    lastStart,
    lastToDateEnd,
    lastOrders.filter((o) => cairoDay(o.createdAt) <= lastToDateEnd),
    parcels,
  );

  return {
    generatedAt: new Date().toISOString(),
    today,
    dayOfMonth,
    daysInMonth,
    current,
    previous,
    previousToDate,
    funnel: funnelData,
    ads: ads ? { ...ads, mer: ads.spend ? current.netSales / ads.spend : 0 } : null,
  };
}
