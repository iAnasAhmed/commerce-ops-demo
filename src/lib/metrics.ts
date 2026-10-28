import { config } from "./config";
import type { MetaInsight } from "./meta";
import type { ShopifyWindow } from "./shopify";

/**
 * The numbers neither Ads Manager nor Shopify will show you.
 *
 * Shopify's total_sales ignores failed COD deliveries entirely, and Meta counts
 * an order that never gets delivered as a win. Both are corrected here using
 * the account's measured RTO rate.
 */
export interface TrueMetrics {
  /** Cost per purchase as Meta reports it. */
  reportedCpp: number;
  /** What a *delivered* order actually costs. */
  rtoAdjustedCpp: number;
  /** Shopify gross, before any deduction. */
  grossSales: number;
  /** Gross minus the expected failed-delivery share. */
  rtoAdjustedRevenue: number;
  /** Revenue Meta never tells you that you lost. */
  expectedRtoLoss: number;
  /** Platform ROAS as Meta reports it. */
  reportedRoas: number;
  /** RTO-adjusted revenue over ad spend — the number that decides things. */
  trueMer: number;
  rtoRate: number;
}

export function computeTrueMetrics(
  meta: MetaInsight | null,
  shopify: ShopifyWindow,
): TrueMetrics {
  const rtoRate = config.rtoRate;
  const spend = meta?.spend ?? 0;
  const reportedCpp = meta?.cpp ?? 0;

  const expectedRtoLoss = shopify.grossSales * rtoRate;
  const rtoAdjustedRevenue = shopify.grossSales - expectedRtoLoss;

  return {
    reportedCpp,
    // A delivered order costs more, because some of what you paid for vanishes.
    rtoAdjustedCpp: reportedCpp / (1 - rtoRate),
    grossSales: shopify.grossSales,
    rtoAdjustedRevenue,
    expectedRtoLoss,
    reportedRoas: meta?.roas ?? 0,
    trueMer: spend ? rtoAdjustedRevenue / spend : 0,
    rtoRate,
  };
}

export type AlertLevel = "critical" | "warning" | "info";

export interface Alert {
  level: AlertLevel;
  title: string;
  detail: string;
}

/** Everything worth waking up for, derived rather than eyeballed. */
export function buildAlerts(
  campaigns: MetaInsight[],
  ads: MetaInsight[],
  trend: MetaInsight[],
): Alert[] {
  const alerts: Alert[] = [];
  const t = config.thresholds;

  /**
   * Frequency is checked per campaign, never on the combined figure. Reach
   * cannot be summed across campaigns without double-counting anyone in two of
   * them, so a combined frequency understates and would hide a saturating
   * campaign behind a fresh one.
   */
  for (const campaign of campaigns) {
    if (campaign.frequency > t.frequencyCeiling) {
      alerts.push({
        level: "warning",
        title: `${campaign.name} — frequency ${campaign.frequency.toFixed(2)}`,
        detail: `Above the ${t.frequencyCeiling} refresh trigger. The same people are seeing these ads repeatedly — rotate creative or widen the audience.`,
      });
    }
  }

  for (const ad of ads) {
    if (ad.spend >= t.adMinSpendToJudge && ad.cpp > t.adCppCeiling) {
      alerts.push({
        level: "critical",
        title: `${ad.name} — CPP ${Math.round(ad.cpp)}`,
        detail: `${ad.campaignName ? `In ${ad.campaignName}. ` : ""}Past the ${t.adCppCeiling} ceiling on ${Math.round(ad.spend)} spend for ${ad.purchases} purchase(s). Pause it.`,
      });
    }
  }

  // Week-over-week CPP movement is the earliest reliable saturation signal.
  const weeks = trend.filter((w) => w.purchases > 0);
  if (weeks.length >= 2) {
    const prev = weeks[weeks.length - 2];
    const latest = weeks[weeks.length - 1];
    if (prev.cpp > 0) {
      const change = (latest.cpp - prev.cpp) / prev.cpp;
      if (change > t.cppRiseWarn) {
        alerts.push({
          level: "critical",
          title: `CPP up ${(change * 100).toFixed(0)}% week over week`,
          detail: `${Math.round(prev.cpp)} to ${Math.round(latest.cpp)}. Rising cost at flat spend means the audience is saturating.`,
        });
      } else if (change < -t.cppRiseWarn) {
        alerts.push({
          level: "info",
          title: `CPP down ${(Math.abs(change) * 100).toFixed(0)}% week over week`,
          detail: `${Math.round(prev.cpp)} to ${Math.round(latest.cpp)}. Whatever changed is working — consider scaling 20%.`,
        });
      }
    }
  }

  if (!alerts.length) {
    alerts.push({
      level: "info",
      title: "Nothing flagged",
      detail:
        "Frequency, per-ad CPP and the weekly trend are all inside their thresholds.",
    });
  }

  return alerts;
}

export function formatEgp(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}
