import { CAMPAIGNS } from "@/demo/world";

/**
 * Account-wide configuration.
 *
 * Everything here reflects decisions made about the Velora Cosmetics demo
 * account. Change a threshold in one place and the whole dashboard follows.
 */

export const config = {
  meta: {
    apiVersion: process.env.META_API_VERSION ?? "v23.0",
    accessToken: process.env.META_ACCESS_TOKEN || "demo",
    adAccountId: process.env.META_AD_ACCOUNT_ID ?? "910000000000001",
    /**
     * Cosmetics only. The ad account is shared with a bridal/studio business,
     * so insights are filtered to these campaigns rather than read account-wide.
     * Anything not listed here — Studio_*, Dresses_* — never reaches the page.
     *
     * Set META_CAMPAIGN_IDS to a comma-separated list to override.
     */
    campaignIds: (
      process.env.META_CAMPAIGN_IDS ??
      CAMPAIGNS.map((c) => c.id).join(",")
    )
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  },

  shopify: {
    apiVersion: process.env.SHOPIFY_API_VERSION ?? "2025-10",
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN ?? "velora-demo.myshopify.com",
    /**
     * Two ways to authenticate, in priority order.
     *
     * 1. Client credentials — the app is built in Shopify's dev dashboard,
     *    which issues a Client ID and Secret rather than a static token. The
     *    Secret is exchanged for a short-lived access token at request time.
     *    This is how a dev-dashboard app authenticates.
     * 2. A static `shpat_` Admin API token, which only store-level custom apps
     *    issue. Kept as a fallback.
     */
    clientId: process.env.SHOPIFY_CLIENT_ID ?? "",
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
    adminToken: process.env.SHOPIFY_ADMIN_TOKEN || "demo",
  },

  bosta: {
    /**
     * Read-only against Bosta too: only ever used for GET/search calls in
     * `bosta.ts`. Never used to cancel, reroute, or otherwise change a
     * delivery — that stays manual, in Bosta's own dashboard.
     */
    apiKey: process.env.BOSTA_API_KEY || "demo",
  },

  /**
   * Failed COD deliveries as a share of gross sales.
   *
   * Shopify does not deduct these, and reversals land weeks after the order,
   * so recent windows always look better than they are. The demo uses
   * 11.56%, a typical rate for COD cosmetics in Egypt. Every "real"
   * number on this dashboard applies this rate rather than trusting Shopify's
   * recorded reversals.
   */
  rtoRate: Number(process.env.RTO_RATE ?? 0.1156),

  currency: "EGP",

  /** Thresholds that drive the alerts panel. */
  thresholds: {
    /** Pause an ad above this cost per purchase (7d, with meaningful spend). */
    adCppCeiling: 350,
    /** Minimum spend before an ad's CPP is worth judging. */
    adMinSpendToJudge: 1000,
    /** Creative refresh trigger. */
    frequencyCeiling: 3.0,
    /** Flag a week-over-week CPP rise above this. */
    cppRiseWarn: 0.15,
    /** A new ad set clears at this CPP, dies above adSetCppKill. */
    adSetCppGood: 220,
    adSetCppKill: 300,
    /** Meta exits learning at 50 conversions/week per ad set. */
    learningConversionsPerWeek: 50,
  },
} as const;

/** Daily budget an ad set needs to exit learning phase, given a CPP. */
export function learningPhaseDailyBudget(cpp: number): number {
  return (cpp * config.thresholds.learningConversionsPerWeek) / 7;
}

export function assertConfigured(): string[] {
  const missing: string[] = [];
  if (!config.meta.accessToken) missing.push("META_ACCESS_TOKEN");

  // Either auth route is fine, so only complain when neither is present.
  const hasClientCredentials =
    config.shopify.clientId && config.shopify.clientSecret;
  if (!hasClientCredentials && !config.shopify.adminToken) {
    missing.push("SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (or SHOPIFY_ADMIN_TOKEN)");
  }
  return missing;
}
