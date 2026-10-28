import { NextResponse } from "next/server";

import { requireRole } from "@/lib/guard";
import { assertConfigured, config, learningPhaseDailyBudget } from "@/lib/config";
import {
  aggregate,
  getAdBreakdown,
  getCampaignBreakdown,
  getCampaignSettings,
  getWeeklyTrend,
} from "@/lib/meta";
import { buildAlerts, computeTrueMetrics } from "@/lib/metrics";
import { getSalesWindow } from "@/lib/shopify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  /**
   * The same check `proxy.ts` performs, repeated here on purpose. Next 16
   * pins Proxy to the Node.js runtime, and OpenNext flags Node middleware on
   * Cloudflare as experimental — so the gate runs on a code path its
   * maintainers do not guarantee. This route returns the actual revenue data,
   * so it refuses on its own rather than trusting that layer.
   */
  const gate = await requireRole(request, "dashboard");
  if ("response" in gate) return gate.response;

  const missing = assertConfigured();
  if (missing.length) {
    return NextResponse.json(
      {
        error: "missing_credentials",
        message: `Set these in .env.local, then restart the dev server: ${missing.join(", ")}`,
        missing,
      },
      { status: 503 },
    );
  }

  try {
    const [
      campaigns7,
      campaigns30,
      campaignsToday,
      settings,
      ads7,
      trend,
      shopify30,
      shopify7,
    ] = await Promise.all([
      getCampaignBreakdown("last_7d"),
      getCampaignBreakdown("last_30d"),
      /**
       * Meta's `last_7d` preset excludes today, so a campaign that launched
       * this morning is invisible in every other window. Launch day is exactly
       * when the Plan tab gets read, which is when that would matter most.
       */
      getCampaignBreakdown("today"),
      getCampaignSettings(),
      getAdBreakdown("last_7d"),
      getWeeklyTrend(90),
      getSalesWindow(30),
      getSalesWindow(7),
    ]);

    // Headline numbers are the three campaigns combined; the breakdown below
    // is what shows whether broad is actually beating the incumbent.
    const last7 = aggregate(campaigns7, "all", "All cosmetics campaigns");
    const last30 = aggregate(campaigns30, "all", "All cosmetics campaigns");

    const true7 = computeTrueMetrics(last7, shopify7);
    const true30 = computeTrueMetrics(last30, shopify30);
    const alerts = buildAlerts(campaigns7, ads7, trend);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      currency: config.currency,
      rtoRate: config.rtoRate,
      thresholds: config.thresholds,
      learningPhaseDailyBudget: last7?.cpp
        ? learningPhaseDailyBudget(last7.cpp)
        : null,
      meta: {
        last7,
        last30,
        campaigns7,
        campaigns30,
        campaignsToday,
        settings,
        ads7,
        trend,
      },
      shopify: { last7: shopify7, last30: shopify30 },
      truth: { last7: true7, last30: true30 },
      alerts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "upstream_failed", message },
      { status: 502 },
    );
  }
}
