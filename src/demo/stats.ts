/**
 * Numbers for the sales page, taken from the same demo world the dashboard
 * reads, so every chart on the page matches the live demo.
 */

import { cairoDay, world, type Outcome } from "./world";

const DAY = 24 * 3600_000;

export interface PageStats {
  days: Array<{ day: string; delivered: number; failed: number; open: number }>;
  weeks: Array<{ week: string; meta: number; real: number }>;
  totals: {
    orders: number;
    revenue: number;
    delivered: number;
    failed: number;
    failedValue: number;
    deliveredRate: number;
    spend: number;
    metaPurchases: number;
    metaCpp: number;
    realCpp: number;
    aov: number;
  };
  funnel: Array<{ label: string; value: number }>;
  reasons: Array<{ label: string; value: number }>;
  payments: Array<{ label: string; value: number }>;
  cities: Array<{ label: string; value: number }>;
}

const REASON: Record<Exclude<Outcome, "delivered">, string> = {
  refused: "Refused",
  no_answer: "No answer",
  postponed: "Postponed",
  whatsapp_cancel: "WhatsApp cancel",
  bosta_cancel: "Courier cancel",
};

export function pageStats(now = Date.now()): PageStats {
  const w = world(now);
  // 30 settled days: the last week is left out so every parcel has an outcome.
  const from = now - 37 * DAY;
  const to = now - 7 * DAY;
  const window = w.orders.filter((o) => o.createdAt >= from && o.createdAt < to && !o.cancelledAt);

  const byDay = new Map<string, { delivered: number; failed: number; open: number }>();
  for (let t = from; t < to; t += DAY) byDay.set(cairoDay(t), { delivered: 0, failed: 0, open: 0 });

  const reasons = new Map<string, number>();
  const payments = new Map<string, number>();
  const cities = new Map<string, number>();
  let revenue = 0;
  let delivered = 0;
  let failed = 0;
  let failedValue = 0;

  for (const o of window) {
    const d = byDay.get(cairoDay(o.createdAt));
    revenue += o.total;
    payments.set(o.payment, (payments.get(o.payment) ?? 0) + 1);
    cities.set(o.customer.city, (cities.get(o.customer.city) ?? 0) + 1);
    const outcome = o.plan?.outcome;
    if (!outcome) {
      if (d) d.open++;
    } else if (outcome === "delivered") {
      delivered++;
      if (d) d.delivered++;
    } else {
      failed++;
      failedValue += o.total;
      if (d) d.failed++;
      reasons.set(REASON[outcome], (reasons.get(REASON[outcome]) ?? 0) + 1);
    }
  }

  // Weekly cost per purchase: what Meta reports vs per delivered order.
  const weeks: PageStats["weeks"] = [];
  for (let k = 8; k >= 1; k--) {
    const wFrom = now - (k * 7 + 7) * DAY;
    const wTo = wFrom + 7 * DAY;
    let spend = 0;
    let purchases = 0;
    for (let t = wFrom; t < wTo; t += DAY) {
      for (const ad of w.adDays.get(cairoDay(t))?.values() ?? []) {
        spend += ad.spend;
        purchases += ad.purchases;
      }
    }
    const got = w.orders.filter((o) => o.createdAt >= wFrom && o.createdAt < wTo && o.plan?.outcome === "delivered").length;
    weeks.push({
      week: new Date(wFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Cairo" }),
      meta: purchases ? Math.round(spend / purchases) : 0,
      real: got ? Math.round(spend / got) : 0,
    });
  }

  let spend = 0;
  let metaPurchases = 0;
  for (let t = from; t < to; t += DAY) {
    for (const ad of w.adDays.get(cairoDay(t))?.values() ?? []) {
      spend += ad.spend;
      metaPurchases += ad.purchases;
    }
  }
  metaPurchases = Math.round(metaPurchases);

  const sorted = (m: Map<string, number>) => [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const PAY: Record<string, string> = { cod: "Cash on delivery", card: "Card", instapay: "Instapay" };

  return {
    days: [...byDay.entries()].map(([day, v]) => ({ day: day.slice(5), ...v })),
    weeks,
    totals: {
      orders: window.length,
      revenue,
      delivered,
      failed,
      failedValue,
      deliveredRate: window.length ? delivered / window.length : 0,
      spend,
      metaPurchases,
      metaCpp: metaPurchases ? spend / metaPurchases : 0,
      realCpp: delivered ? spend / delivered : 0,
      aov: window.length ? revenue / window.length : 0,
    },
    funnel: [
      { label: "Meta purchases", value: metaPurchases },
      { label: "Shopify orders", value: window.length },
      { label: "Delivered", value: delivered },
    ],
    reasons: sorted(reasons),
    payments: sorted(payments).map((p) => ({ ...p, label: PAY[p.label] ?? p.label })),
    cities: sorted(cities).slice(0, 6),
  };
}
