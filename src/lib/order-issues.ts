import {
  getDeliveryDetail,
  mapPool,
  searchRecentDeliveries,
  whoCancelled,
  type BostaDelivery,
  type BostaDeliveryDetail,
} from "./bosta";
import { shopifyGraphQL } from "./shopify";

/**
 * Every order placed in the last 5 days that needs a person, found by laying
 * Shopify and Bosta side by side:
 *
 * - critical — money at risk or the wrong waybill: a cancelled order whose
 *   waybill is still open, items that are on no waybill, a COD that doesn't
 *   match the order, a prepaid order coming back.
 * - warning  — needs confirming: an Instapay payment still pending, a parcel
 *   Bosta hasn't picked up after a day.
 * - slow     — placed more than 3 days ago and still not delivered, or flagged
 *   late by Bosta.
 * - customer — cancelled on WhatsApp, cancelled by Bosta, or a failed delivery
 *   attempt. These are the Action Needed call list; older orders with such an
 *   event in the last 5 days are included here too.
 *
 * Checked against the live store and Bosta on 14 Sep 2026. A COD gap is only
 * reported after reading the parcel's detail, because a customer who pays
 * Bosta by card or Apple Pay at the door leaves COD at 0 and is not a problem.
 */

export type IssueSeverity = "critical" | "warning" | "slow" | "customer" | "info";

export type IssueKind =
  | "cancelled_waybill_active"
  | "items_not_shipped"
  | "not_in_bosta"
  | "cod_mismatch"
  | "prepaid_returned"
  | "instapay_cash_collection"
  | "instapay_unpaid"
  | "not_picked_up"
  | "slow_delivery"
  | "customer_cancelled_whatsapp"
  | "cancelled_by_bosta"
  | "failed_attempt"
  | "merged_shipment";

export interface OrderIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  title: string;
  detail: string;
  action: string;
}

export interface IssueOrder {
  orderRef: string;
  placedAt: string | null;
  total: number | null;
  payment: string;
  paid: boolean;
  cancelledInShopify: boolean;
  trackingNumber: string | null;
  bostaStatus: string | null;
  issues: OrderIssue[];
  /** The worst issue on the order — decides which section it sits in. */
  severity: IssueSeverity;
}

export interface OrderIssuesReport {
  windowDays: number;
  ordersChecked: number;
  cleanOrders: number;
  orders: IssueOrder[];
}

const WINDOW_DAYS = 5;
/** Parcels are read further back so an older order's recent failure still shows. */
const BOSTA_FETCH_DAYS = 21;
const HOUR_MS = 60 * 60 * 1000;
const PICKUP_REQUESTED = 10;
const DELIVERED = 45;
const RETURNED = 46;
const TERMINATED = 48;

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  slow: 2,
  customer: 3,
  info: 4,
};

type Money = { shopMoney: { amount: string } };

interface ShopifyOrder {
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  paymentGatewayNames: string[];
  totalPriceSet: Money;
  currentTotalPriceSet: Money;
  lineItems: {
    nodes: Array<{
      title: string;
      quantity: number;
      unfulfilledQuantity: number;
      originalTotalSet: Money;
    }>;
  };
}

interface OrdersPage {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyOrder[];
  };
}

// 25 orders × 15 line items keeps each page well under Shopify's query cost cap.
const ISSUE_ORDERS_QUERY = `
  query IssueOrders($q: String!, $cursor: String) {
    orders(first: 25, query: $q, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        paymentGatewayNames
        totalPriceSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        lineItems(first: 15) {
          nodes {
            title
            quantity
            unfulfilledQuantity
            originalTotalSet { shopMoney { amount } }
          }
        }
      }
    }
  }
`;

async function getRecentOrders(since: Date): Promise<ShopifyOrder[]> {
  const q = `created_at:>='${since.toISOString()}'`;
  const nodes: ShopifyOrder[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 10; page += 1) {
    const data: OrdersPage = await shopifyGraphQL<OrdersPage>(ISSUE_ORDERS_QUERY, { q, cursor });
    nodes.push(...data.orders.nodes);
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }
  return nodes;
}

type PaymentMethod = "cod" | "card" | "instapay" | "other";

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cod: "Cash on delivery",
  card: "Card (Paymob)",
  instapay: "Instapay",
  other: "Other payment",
};

function paymentMethod(gateways: string[]): PaymentMethod {
  const text = gateways.join(" ").toLowerCase();
  if (text.includes("instapay")) return "instapay";
  if (text.includes("cash on delivery") || /\bcod\b/.test(text)) return "cod";
  if (/paymob|card|visa|mastercard|apple/.test(text)) return "card";
  return "other";
}

const amount = (money: Money) => Number(money.shopMoney.amount) || 0;
const egp = (n: number) => `EGP ${Math.round(n).toLocaleString("en-US")}`;
const refOf = (d: BostaDelivery) => (d.businessReference ?? "").replace(/^.*:/, "");
const time = (value: string | undefined | null) => (value ? new Date(value).getTime() : 0);

function customerFailures(d: BostaDelivery) {
  return (d.state?.exception ?? [])
    .filter((e) => e.attemptType !== "return" && e.reason)
    .sort((a, b) => time(a.time) - time(b.time));
}

function cleanReason(reason: string): string {
  const text = reason
    .replace(/^(cancellation|retry delivery|postponed|waiting for data modification)\s*-\s*/i, "")
    .replace(/\.$/, "")
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isOpenSend(d: BostaDelivery): boolean {
  const code = d.state?.code;
  return (
    d.type?.value === "Send" &&
    code !== undefined &&
    code !== DELIVERED &&
    code !== RETURNED &&
    code !== TERMINATED &&
    !d.state?.canceled?.time
  );
}

function itemsKey(order: ShopifyOrder): string {
  return order.lineItems.nodes
    .map((item) => `${item.title}×${item.quantity}`)
    .sort()
    .join("|");
}

function reorderText(order: ShopifyOrder, other: ShopifyOrder): string {
  const minutes = Math.round(Math.abs(time(other.createdAt) - time(order.createdAt)) / 60000);
  const when = time(other.createdAt) >= time(order.createdAt) ? "after" : "before";
  return `A matching order, ${other.name}, was placed ${minutes} minute${minutes === 1 ? "" : "s"} ${when} — most likely the customer's re-order.`;
}

/** The failure, cancellation or refusal a support call is for — or null. */
function customerIssue(d: BostaDelivery, detail: BostaDeliveryDetail | null): OrderIssue | null {
  if (d.state?.code === DELIVERED) return null;
  const failures = customerFailures(d);
  const cancelledAt = d.state?.canceled?.time ?? null;
  const status = d.state?.value ?? "unknown";

  if (failures.length > 0) {
    const last = failures[failures.length - 1];
    return {
      kind: "failed_attempt",
      severity: "customer",
      title: `Delivery attempt failed${failures.length > 1 ? ` (${failures.length} attempts)` : ""}`,
      detail: `Last: ${cleanReason(last.reason ?? "")}. Bosta: ${status}.`,
      action: "Call the customer — it's in the Action Needed call list.",
    };
  }

  if (cancelledAt) {
    const by = detail ? whoCancelled(detail.log, cancelledAt) : "unknown";
    return by === "whatsapp"
      ? {
          kind: "customer_cancelled_whatsapp",
          severity: "customer",
          title: "Customer cancelled on Bosta's WhatsApp confirmation",
          detail: `Before any delivery attempt. Bosta: ${status}.`,
          action: "Call the customer — it's in the Action Needed call list.",
        }
      : {
          kind: "cancelled_by_bosta",
          severity: "customer",
          title:
            by === "bosta"
              ? "Cancelled by Bosta before any delivery attempt"
              : "Cancelled before any delivery attempt — Bosta's log doesn't say who",
          detail: `Bosta: ${status}.`,
          action: "Call the customer, and ask Bosta why it was cancelled.",
        };
  }

  return null;
}

function worst(issues: OrderIssue[]): IssueSeverity {
  return issues.reduce<IssueSeverity>(
    (acc, issue) => (SEVERITY_RANK[issue.severity] < SEVERITY_RANK[acc] ? issue.severity : acc),
    "info",
  );
}

/** Every item title on `part` also appears on `whole`. */
function itemsWithin(part: ShopifyOrder, whole: ShopifyOrder): boolean {
  const titles = new Set(whole.lineItems.nodes.map((item) => item.title));
  return part.lineItems.nodes.length > 0 && part.lineItems.nodes.every((item) => titles.has(item.title));
}

export async function getOrderIssues(): Promise<OrderIssuesReport> {
  const now = Date.now();
  const since = new Date(now - WINDOW_DAYS * 24 * HOUR_MS);

  const [orders, parcels] = await Promise.all([
    getRecentOrders(since),
    searchRecentDeliveries(BOSTA_FETCH_DAYS),
  ]);

  const byRef = new Map<string, BostaDelivery[]>();
  for (const parcel of parcels) {
    const ref = refOf(parcel);
    if (!ref) continue;
    byRef.set(ref, [...(byRef.get(ref) ?? []), parcel]);
  }
  for (const list of byRef.values()) {
    list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
  }

  const windowRefs = new Set(orders.map((o) => o.name));

  // Detail is only needed for a handful of parcels: who cancelled one, and
  // whether a COD gap was paid online at the door.
  const detailWanted = new Set<string>();
  for (const order of orders) {
    const parcel = byRef.get(order.name)?.[0];
    if (!parcel?.trackingNumber || order.cancelledAt) continue;
    if (parcel.state?.canceled?.time && customerFailures(parcel).length === 0) {
      detailWanted.add(parcel.trackingNumber);
    }
    if (
      paymentMethod(order.paymentGatewayNames) === "cod" &&
      parcel.type?.value === "Send" &&
      Math.abs((parcel.cod ?? 0) - amount(order.currentTotalPriceSet)) > 1
    ) {
      detailWanted.add(parcel.trackingNumber);
    }
  }

  const olderParcels = new Map<string, BostaDelivery>();
  for (const parcel of parcels) {
    const ref = refOf(parcel);
    if (!/^#VL/.test(ref) || windowRefs.has(ref) || olderParcels.has(ref)) continue;
    if (byRef.get(ref)?.[0] !== parcel) continue;
    if (!["Send", "Return to Origin"].includes(parcel.type?.value ?? "")) continue;
    if (parcel.state?.code === DELIVERED) continue;
    const failures = customerFailures(parcel);
    const lastEvent = Math.max(
      time(failures[failures.length - 1]?.time),
      time(parcel.state?.canceled?.time),
    );
    if (lastEvent < since.getTime()) continue;
    olderParcels.set(ref, parcel);
    if (parcel.trackingNumber && parcel.state?.canceled?.time && failures.length === 0) {
      detailWanted.add(parcel.trackingNumber);
    }
  }

  const trackingNumbers = [...detailWanted];
  const details = await mapPool(trackingNumbers, 10, async (tn) => {
    try {
      return await getDeliveryDetail(tn);
    } catch {
      return null;
    }
  });
  const detailByTn = new Map(trackingNumbers.map((tn, i) => [tn, details[i]]));

  const report: IssueOrder[] = [];
  let cleanOrders = 0;

  for (const order of orders) {
    const issues: OrderIssue[] = [];
    const ageHours = (now - time(order.createdAt)) / HOUR_MS;
    const pay = paymentMethod(order.paymentGatewayNames);
    const total = amount(order.totalPriceSet);
    const current = amount(order.currentTotalPriceSet);
    const paid = order.displayFinancialStatus === "PAID";
    const orderParcels = byRef.get(order.name) ?? [];
    const parcel = orderParcels[0];
    const detail = parcel?.trackingNumber ? detailByTn.get(parcel.trackingNumber) ?? null : null;

    // The Shopify app has no read_customers scope, so a re-order is recognised
    // by identical items placed within two hours — a store this size rarely
    // gets two identical orders that close together from different people.
    const siblings = orders.filter(
      (other) =>
        other !== order &&
        itemsKey(other) === itemsKey(order) &&
        Math.abs(time(other.createdAt) - time(order.createdAt)) <= 2 * HOUR_MS,
    );

    if (order.cancelledAt) {
      const replacement =
        siblings.find((other) => !other.cancelledAt) ??
        orders.find(
          (other) =>
            other !== order &&
            !other.cancelledAt &&
            Math.abs(time(other.createdAt) - time(order.createdAt)) <= 2 * HOUR_MS &&
            itemsWithin(order, other),
        );
      for (const open of orderParcels.filter(isOpenSend)) {
        const tn = open.trackingNumber ?? "";
        const cod = egp(open.cod ?? 0);
        const reorderNote = replacement ? ` ${reorderText(order, replacement)}` : "";
        if (open.state?.code === PICKUP_REQUESTED) {
          issues.push({
            kind: "cancelled_waybill_active",
            severity: "critical",
            title: "Cancelled in Shopify, but the Bosta waybill is still open",
            detail: `Waybill ${tn} is waiting for pickup with COD ${cod}.${reorderNote}`,
            action: `Cancel waybill ${tn} in Bosta so it isn't picked up or charged.`,
          });
        } else {
          issues.push({
            kind: "cancelled_waybill_active",
            severity: "critical",
            title: "Cancelled in Shopify, but Bosta is delivering it",
            detail: `Bosta: ${open.state?.value ?? "in progress"}, COD ${cod}.${
              replacement
                ? ` ${reorderText(order, replacement)} The parcel is probably moving under this cancelled order's waybill.`
                : ""
            }`,
            action: replacement
              ? `Keep one waybill: cancel ${replacement.name}'s waybill in Bosta, and match this COD to ${replacement.name} when it's paid.`
              : "Ask Bosta to stop the parcel, or confirm the customer still wants it.",
          });
        }
      }
    } else {
      const unfulfilled = order.lineItems.nodes.filter((item) => item.unfulfilledQuantity > 0);

      // A merge done by hand: the customer ordered twice, one order was
      // cancelled and its items added to this one, and the parcel went out on
      // the cancelled order's waybill. Bosta then has nothing under this number.
      const mergedFrom = !parcel
        ? orders
            .filter(
              (other) =>
                other !== order &&
                other.cancelledAt &&
                Math.abs(time(other.createdAt) - time(order.createdAt)) <= 2 * HOUR_MS &&
                itemsWithin(other, order),
            )
            .map((other) => ({
              other,
              shipped: (byRef.get(other.name) ?? []).find(
                (p) => p.type?.value === "Send" && !p.state?.canceled?.time && (p.state?.code ?? 0) >= PICKUP_REQUESTED,
              ),
            }))
            .find((m) => m.shipped)
        : undefined;

      if (mergedFrom?.shipped) {
        const shipped = mergedFrom.shipped;
        const tn = shipped.trackingNumber ?? "";
        const cod = shipped.cod ?? 0;
        const status = shipped.state?.value ?? "unknown";
        const owed = paid ? 0 : current;
        const codOk = Math.abs(cod - owed) <= 1 || shipped.state?.code === DELIVERED;
        issues.push(
          codOk
            ? {
                kind: "merged_shipment",
                severity: "info",
                title: `Shipped on cancelled order ${mergedFrom.other.name}'s waybill`,
                detail: `Waybill ${tn} (Bosta: ${status}, COD ${egp(cod)}) carries ${mergedFrom.other.name}'s number. ${paid ? `This order is paid (${PAYMENT_LABEL[pay]}).` : `COD matches this order's ${egp(current)}.`}`,
                action: "Nothing to do if you merged these orders. Otherwise check what went out.",
              }
            : {
                kind: "merged_shipment",
                severity: "critical",
                title: `Shipped on cancelled order ${mergedFrom.other.name}'s waybill — COD doesn't match`,
                detail: `Waybill ${tn} (Bosta: ${status}) will collect ${egp(cod)}; this order ${paid ? "is already paid" : `is ${egp(current)}`}.`,
                action: `Set the COD on waybill ${tn} to ${egp(owed)} before delivery.`,
              },
        );
      } else if (!parcel && ageHours > 24) {
        issues.push({
          kind: "not_in_bosta",
          severity: "critical",
          title: "Not sent to Bosta",
          detail: `No Bosta waybill ${Math.round(ageHours)} hours after the order (Shopify: ${order.displayFulfillmentStatus.toLowerCase().replace(/_/g, " ")}).`,
          action: "Create the waybill, or confirm how this order is being delivered.",
        });
      } else if (parcel && unfulfilled.length > 0 && ageHours > 24) {
        const missingValue = unfulfilled.reduce(
          (sum, item) => sum + (amount(item.originalTotalSet) / Math.max(item.quantity, 1)) * item.unfulfilledQuantity,
          0,
        );
        issues.push({
          kind: "items_not_shipped",
          severity: "critical",
          title: "Part of the order isn't on the waybill",
          detail: `${unfulfilled.map((item) => `${item.title} ×${item.unfulfilledQuantity}`).join(", ")} (${egp(missingValue)}) not shipped. Bosta COD is ${egp(parcel.cod ?? 0)} against an order of ${egp(current)}.`,
          action: "Ship the missing items, or adjust the order and the COD.",
        });
      }

      if (parcel) {
        const code = parcel.state?.code;
        const status = parcel.state?.value ?? "unknown";
        const isSend = parcel.type?.value === "Send";
        const cancelledInBosta = Boolean(parcel.state?.canceled?.time);
        const returning =
          parcel.type?.value === "Return to Origin" || code === RETURNED || cancelledInBosta;
        const cod = parcel.cod ?? 0;

        if (pay !== "cod" && paid && returning) {
          issues.push({
            kind: "prepaid_returned",
            severity: "critical",
            title: "Prepaid order is coming back",
            detail: `Paid ${egp(current)} by ${PAYMENT_LABEL[pay]}. Bosta: ${status}.`,
            action: "Refund the customer, or re-ship the order.",
          });
        }

        if (pay === "instapay" && !paid && !returning && code !== DELIVERED) {
          issues.push(
            cod >= current - 1 && current > 0
              ? {
                  kind: "instapay_cash_collection",
                  severity: "warning",
                  title: "Instapay order — Bosta will collect cash",
                  detail: `Shopify still shows the Instapay payment as pending; Bosta will collect ${egp(cod)} on delivery.`,
                  action: "Confirm the customer hasn't already transferred — otherwise they pay twice.",
                }
              : {
                  kind: "instapay_unpaid",
                  severity: "warning",
                  title: "Instapay payment not confirmed",
                  detail: `Shopify shows the payment as pending and Bosta COD is ${egp(cod)} — it ships unpaid if the transfer never came.`,
                  action: "Check the transfer arrived before delivery, or set the COD on the waybill.",
                },
          );
        }

        if (pay === "card" && paid && isSend && !returning && cod > 0) {
          issues.push({
            kind: "cod_mismatch",
            severity: "critical",
            title: "Paid by card, but Bosta will collect cash",
            detail: `Paid ${egp(current)} online; the waybill still has COD ${egp(cod)}.`,
            action: "Set the COD on the waybill to 0 before delivery.",
          });
        }

        if (pay === "cod" && isSend && !returning && unfulfilled.length === 0 && Math.abs(cod - current) > 1) {
          const online =
            detail?.paymentInfo?.capturedStatus === "SUCCEEDED" ? Number(detail.paymentInfo.amount ?? 0) : 0;
          if (Math.abs(cod + online - current) > 1) {
            issues.push({
              kind: "cod_mismatch",
              severity: "critical",
              title: "COD doesn't match the order",
              detail: `Bosta will collect ${egp(cod)}${online ? ` (plus ${egp(online)} already paid online)` : ""}; the Shopify total is ${egp(current)}.`,
              action: "Fix the COD on the waybill before delivery.",
            });
          }
        }

        if (isSend && code === PICKUP_REQUESTED && !cancelledInBosta && ageHours > 24) {
          const movingSibling = siblings.find(
            (other) =>
              other.cancelledAt &&
              (byRef.get(other.name) ?? []).some((p) => isOpenSend(p) && (p.state?.code ?? 0) >= 20),
          );
          issues.push({
            kind: "not_picked_up",
            severity: "warning",
            title: "Not picked up by Bosta",
            detail: `Waiting for pickup ${Math.round(ageHours)} hours after the order.${
              movingSibling ? ` The parcel may be moving under cancelled order ${movingSibling.name}'s waybill.` : ""
            }`,
            action: movingSibling
              ? `Check with the packing team, then cancel this waybill if the parcel went out as ${movingSibling.name}.`
              : "Chase Bosta for pickup, or check the parcel is packed and ready.",
          });
        }

        if (
          isSend &&
          code !== undefined &&
          code >= 20 &&
          code < DELIVERED &&
          !cancelledInBosta &&
          (ageHours > 72 || parcel.isDelayed)
        ) {
          const days = (ageHours / 24).toFixed(1);
          issues.push({
            kind: "slow_delivery",
            severity: "slow",
            title: `Not delivered after ${days} days`,
            detail: `Bosta: ${status}${parcel.isDelayed ? " — Bosta marks it delayed" : ""}. COD ${egp(cod)}.`,
            action: "Ask Bosta for a delivery date, and let the customer know.",
          });
        }

        const call = customerIssue(parcel, detail);
        if (call) issues.push(call);
      }
    }

    if (issues.length === 0) {
      cleanOrders += 1;
      continue;
    }

    report.push({
      orderRef: order.name,
      placedAt: order.createdAt,
      total: order.cancelledAt ? total : current,
      payment: PAYMENT_LABEL[pay],
      paid,
      cancelledInShopify: Boolean(order.cancelledAt),
      trackingNumber: parcel?.trackingNumber ?? null,
      bostaStatus: parcel?.state?.value ?? null,
      issues,
      severity: worst(issues),
    });
  }

  for (const [ref, parcel] of olderParcels) {
    const detail = parcel.trackingNumber ? detailByTn.get(parcel.trackingNumber) ?? null : null;
    const issue = customerIssue(parcel, detail);
    if (!issue) continue;
    report.push({
      orderRef: ref,
      placedAt: parcel.createdAt ? new Date(parcel.createdAt).toISOString() : null,
      total: null,
      payment: "—",
      paid: false,
      cancelledInShopify: false,
      trackingNumber: parcel.trackingNumber ?? null,
      bostaStatus: parcel.state?.value ?? null,
      issues: [{ ...issue, detail: `Older order. ${issue.detail}` }],
      severity: "customer",
    });
  }

  report.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || time(b.placedAt) - time(a.placedAt),
  );

  return {
    windowDays: WINDOW_DAYS,
    ordersChecked: orders.length,
    cleanOrders,
    orders: report,
  };
}
