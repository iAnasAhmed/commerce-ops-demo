import { config } from "./config";
import { demoFetch } from "@/demo/fake-api";

/** One row of Meta insights, normalised into numbers we can do maths on. */
export interface MetaInsight {
  id: string;
  name: string;
  /** Which cosmetics campaign this row belongs to. Absent on aggregates. */
  campaignName?: string;
  status?: string;
  spend: number;
  purchases: number;
  purchaseValue: number;
  cpp: number;
  roas: number;
  reach: number;
  impressions: number;
  frequency: number;
  ctr: number;
  cpm: number;
  dateStart?: string;
  dateStop?: string;
  linkClicks?: number;
  addToCart?: number;
  /** The breakdown value (platform, region…) when one was requested. */
  breakdown?: string;
}

const FIELDS = [
  "spend",
  "reach",
  "impressions",
  "frequency",
  "ctr",
  "cpm",
  "actions",
  "action_values",
  "cost_per_action_type",
  "purchase_roas",
].join(",");

export function graphUrl(path: string, params: Record<string, string>): string {
  const url = new URL(
    `https://graph.facebook.com/${config.meta.apiVersion}/${path}`,
  );
  url.searchParams.set("access_token", config.meta.accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Meta returns conversions as an array of {action_type, value} pairs. Purchases
 * live under `omni_purchase` or `purchase` depending on the setup, so check both.
 */
function pickAction(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: string[],
): number {
  if (!actions) return 0;
  for (const type of types) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

interface RawInsight {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  reach?: string;
  impressions?: string;
  frequency?: string;
  ctr?: string;
  cpm?: string;
  date_start?: string;
  date_stop?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  publisher_platform?: string;
  region?: string;
}

function normalise(raw: RawInsight, level: Level): MetaInsight {
  const spend = Number(raw.spend) || 0;
  const purchases = pickAction(raw.actions, PURCHASE_TYPES);
  const purchaseValue = pickAction(raw.action_values, PURCHASE_TYPES);
  const reportedCpp = pickAction(raw.cost_per_action_type, PURCHASE_TYPES);
  const reportedRoas = pickAction(raw.purchase_roas, PURCHASE_TYPES);

  const id =
    (level === "ad" ? raw.ad_id : level === "adset" ? raw.adset_id : raw.campaign_id) ?? "";
  const name =
    (level === "ad" ? raw.ad_name : level === "adset" ? raw.adset_name : raw.campaign_name) ??
    "Unknown";

  return {
    id,
    name,
    campaignName: raw.campaign_name,
    spend,
    purchases,
    purchaseValue,
    // Prefer Meta's own cost-per-purchase; it is reliable where the raw
    // `action_values` field is not (it under-reports ~100x on smaller entities).
    cpp: reportedCpp || (purchases ? spend / purchases : 0),
    roas: reportedRoas || (spend ? purchaseValue / spend : 0),
    reach: Number(raw.reach) || 0,
    impressions: Number(raw.impressions) || 0,
    frequency: Number(raw.frequency) || 0,
    ctr: Number(raw.ctr) || 0,
    cpm: Number(raw.cpm) || 0,
    dateStart: raw.date_start,
    dateStop: raw.date_stop,
    linkClicks: pickAction(raw.actions, ["link_click"]),
    addToCart: pickAction(raw.actions, ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"]),
    breakdown: raw.publisher_platform ?? raw.region,
  };
}

export type Level = "campaign" | "adset" | "ad";

export async function fetchInsights(
  level: Level,
  params: Record<string, string>,
  campaignIds: readonly string[] = config.meta.campaignIds,
): Promise<MetaInsight[]> {
  const fields =
    FIELDS +
    ",campaign_id,campaign_name" +
    (level === "ad"
      ? ",ad_id,ad_name"
      : level === "adset"
        ? ",adset_id,adset_name"
        : "");

  /**
   * Read at the account level and filter to the cosmetics campaigns, rather
   * than looping one request per campaign. One call keeps the three windows
   * consistent with each other, and `campaign_name` comes back on every row so
   * ads can be attributed without a second lookup.
   */
  const url = graphUrl(`act_${config.meta.adAccountId}/insights`, {
    level,
    fields,
    limit: "500",
    filtering: JSON.stringify([
      {
        field: "campaign.id",
        operator: "IN",
        value: campaignIds,
      },
    ]),
    ...params,
  });

  const res = await demoFetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = (await res.json()) as { data?: RawInsight[]; paging?: { next?: string } };
  const rows = json.data ?? [];
  // Daily and breakdown reads can pass 500 rows; follow a few pages.
  let next = json.paging?.next;
  for (let page = 0; next && page < 5; page += 1) {
    const more = await demoFetch(next, { cache: "no-store" });
    if (!more.ok) break;
    const body = (await more.json()) as { data?: RawInsight[]; paging?: { next?: string } };
    rows.push(...(body.data ?? []));
    next = body.paging?.next;
  }
  return rows.map((row) => normalise(row, level));
}

/**
 * Roll several rows into one.
 *
 * CPP and ROAS are recomputed from the totals rather than averaged — averaging
 * ratios weights a campaign spending 400/day the same as one spending 1,800.
 *
 * Reach is summed, which is an *upper* bound: someone reached by both broad and
 * retargeting is counted twice. Combined frequency is therefore a lower bound
 * and is marked approximate. Per-campaign frequency is exact, which is why the
 * frequency alert runs per campaign.
 */
export function aggregate(
  rows: MetaInsight[],
  id: string,
  name: string,
): MetaInsight | null {
  if (!rows.length) return null;

  const spend = rows.reduce((sum, r) => sum + r.spend, 0);
  const purchases = rows.reduce((sum, r) => sum + r.purchases, 0);
  const purchaseValue = rows.reduce((sum, r) => sum + r.purchaseValue, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const reach = rows.reduce((sum, r) => sum + r.reach, 0);

  // Weighted by spend, since ROAS is value per unit of spend.
  const weightedRoas = spend
    ? rows.reduce((sum, r) => sum + r.roas * r.spend, 0) / spend
    : 0;

  return {
    id,
    name,
    spend,
    purchases,
    purchaseValue,
    cpp: purchases ? spend / purchases : 0,
    roas: weightedRoas,
    reach,
    impressions,
    frequency: reach ? impressions / reach : 0,
    ctr: impressions
      ? rows.reduce((sum, r) => sum + r.ctr * r.impressions, 0) / impressions
      : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
    dateStart: rows[0]?.dateStart,
    dateStop: rows[0]?.dateStop,
  };
}

/** One row per cosmetics campaign, biggest spender first. */
export async function getCampaignBreakdown(
  datePreset: string,
): Promise<MetaInsight[]> {
  const rows = await fetchInsights("campaign", { date_preset: datePreset });
  return rows.sort((a, b) => b.spend - a.spend);
}

/** All cosmetics campaigns combined, for the headline numbers. */
export async function getCampaignTotals(
  datePreset: string,
): Promise<MetaInsight | null> {
  const rows = await getCampaignBreakdown(datePreset);
  return aggregate(rows, "all", "All cosmetics campaigns");
}

/** Per-ad breakdown across every cosmetics campaign, biggest spender first. */
export async function getAdBreakdown(datePreset: string): Promise<MetaInsight[]> {
  const rows = await fetchInsights("ad", { date_preset: datePreset });
  return rows.sort((a, b) => b.spend - a.spend);
}

/**
 * Weekly trend, combined across campaigns. Meta returns one row per campaign
 * per week, so rows sharing a date_start are rolled together — otherwise the
 * chart would draw three overlapping series and the week-over-week CPP alert
 * would compare a week of one campaign against a week of another.
 */
export async function getWeeklyTrend(days = 90): Promise<MetaInsight[]> {
  const rows = await fetchInsights("campaign", {
    date_preset: `last_${days}d`,
    time_increment: "7",
  });

  const byWeek = new Map<string, MetaInsight[]>();
  for (const row of rows) {
    const key = row.dateStart ?? "";
    byWeek.set(key, [...(byWeek.get(key) ?? []), row]);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, weekRows]) => aggregate(weekRows, week, week))
    .filter((row): row is MetaInsight => row !== null);
}

/** Live campaign settings, for checking the plan against what is actually set. */
export interface CampaignSettings {
  id: string;
  name: string;
  status: string;
  /** Daily budget in EGP. Null when the campaign uses a lifetime budget. */
  dailyBudget: number | null;
  /** True when Advantage campaign budget (CBO) is on. */
  cbo: boolean;
}

/**
 * Budgets and status straight off the campaign objects.
 *
 * Insights does not carry these, so this is a second call. Meta returns money
 * in the currency's minor unit — EGP 1,800/day comes back as "180000".
 */
export async function getCampaignSettings(): Promise<CampaignSettings[]> {
  const url = graphUrl(`act_${config.meta.adAccountId}/campaigns`, {
    fields: "id,name,effective_status,daily_budget,lifetime_budget",
    limit: "500",
    filtering: JSON.stringify([
      { field: "campaign.id", operator: "IN", value: config.meta.campaignIds },
    ]),
  });

  const res = await demoFetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      name: string;
      effective_status?: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>;
  };

  return (json.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.effective_status ?? "UNKNOWN",
    dailyBudget: row.daily_budget ? Number(row.daily_budget) / 100 : null,
    // A budget set at campaign level is what Advantage campaign budget means.
    cbo: Boolean(row.daily_budget || row.lifetime_budget),
  }));
}
