import { searchRecentDeliveries, type BostaDelivery } from "./bosta";
import { shopifyGraphQL } from "./shopify";

/**
 * Every Instapay order from the last 7 days, with what Shopify says about the
 * payment and what Bosta will collect. The screenshot check is manual: someone
 * looks at the transfer and ticks it here (saved in D1). Marking the order paid
 * stays manual, in Shopify — this app never writes to Shopify.
 */

export const INSTAPAY_WINDOW_DAYS = 7;

export interface InstapayOrder {
  id: string;
  orderRef: string;
  placedAt: string;
  cancelled: boolean;
  financialStatus: string;
  paid: boolean;
  total: number;
  outstanding: number;
  customerName: string;
  phone: string;
  trackingNumber: string | null;
  bostaStatus: string | null;
  bostaCod: number | null;
}

type Money = { shopMoney: { amount: string } };

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  paymentGatewayNames: string[];
  currentTotalPriceSet: Money;
  totalOutstandingSet: Money;
}

interface OrdersPage {
  orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] };
}

const QUERY = `
  query InstapayOrders($q: String!, $cursor: String) {
    orders(first: 100, query: $q, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        paymentGatewayNames
        currentTotalPriceSet { shopMoney { amount } }
        totalOutstandingSet { shopMoney { amount } }
      }
    }
  }
`;

const amount = (money: Money) => Number(money.shopMoney.amount) || 0;
export const isInstapay = (gateways: string[]) => gateways.join(" ").toLowerCase().includes("instapay");
const refOf = (d: BostaDelivery) => (d.businessReference ?? "").replace(/^.*:/, "");

export async function getInstapayOrders(): Promise<InstapayOrder[]> {
  const since = new Date(Date.now() - INSTAPAY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const q = `created_at:>='${since.toISOString()}'`;

  const nodes: OrderNode[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const data: OrdersPage = await shopifyGraphQL<OrdersPage>(QUERY, { q, cursor });
    nodes.push(...data.orders.nodes);
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  const parcels = await searchRecentDeliveries(INSTAPAY_WINDOW_DAYS + 3);
  const byRef = new Map<string, BostaDelivery>();
  for (const parcel of parcels) {
    const ref = refOf(parcel);
    const known = byRef.get(ref);
    if (ref && (!known || (parcel.createdAt ?? "") > (known.createdAt ?? ""))) byRef.set(ref, parcel);
  }

  return nodes
    .filter((order) => isInstapay(order.paymentGatewayNames))
    .map((order) => {
      const parcel = byRef.get(order.name);
      return {
        id: order.id,
        orderRef: order.name,
        placedAt: order.createdAt,
        cancelled: Boolean(order.cancelledAt),
        financialStatus: order.displayFinancialStatus,
        paid: order.displayFinancialStatus === "PAID",
        total: amount(order.currentTotalPriceSet),
        outstanding: amount(order.totalOutstandingSet),
        customerName: parcel?.receiver?.fullName ?? "",
        phone: parcel?.receiver?.phone ?? "",
        trackingNumber: parcel?.trackingNumber ?? null,
        bostaStatus: parcel?.state?.value ?? null,
        bostaCod: parcel ? parcel.cod ?? 0 : null,
      };
    });
}

export interface InstapayCheck {
  orderRef: string;
  screenshot: "Yes" | "No";
  note: string;
  updatedAt: string;
}

export async function getInstapayChecks(db: D1Database): Promise<InstapayCheck[]> {
  const { results } = await db
    .prepare("SELECT order_ref, screenshot, note, updated_at FROM instapay_checks")
    .all<{ order_ref: string; screenshot: string; note: string | null; updated_at: string }>();
  return results.map((row) => ({
    orderRef: row.order_ref,
    screenshot: row.screenshot === "Yes" ? "Yes" : "No",
    note: row.note ?? "",
    updatedAt: row.updated_at,
  }));
}

export async function saveInstapayCheck(
  db: D1Database,
  entry: { orderRef: string; screenshot: "Yes" | "No"; note: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO instapay_checks (order_ref, screenshot, note, updated_at)
       VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(order_ref) DO UPDATE SET
         screenshot = excluded.screenshot, note = excluded.note, updated_at = datetime('now')`,
    )
    .bind(entry.orderRef, entry.screenshot, entry.note)
    .run();
}
