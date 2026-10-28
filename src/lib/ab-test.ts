import { CAMPAIGNS } from "@/demo/world";

const DAY = 24 * 3600_000;
const cairo = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(Date.now() + offsetDays * DAY));

/**
 * The running Meta A/B test. In the demo it always started 17 days ago and
 * ends in 3 days, so the Test tab shows a test in progress.
 *
 * Same ads, same audience, only the location differs. Decision rule: B needs
 * at least 20% more orders for the same spend (Shopify orders + Bosta
 * delivered), otherwise the result is inconclusive and A stays.
 */
export const AB_TEST = {
  name: "Test_Location_AllEgypt",
  studyId: "940000000000000001",
  start: cairo(-17),
  end: cairo(3),
  decisionDate: cairo(4),
  rule: "B wins only with at least 20% more orders for the same spend (Shopify orders and Bosta delivered). Otherwise inconclusive — keep A.",
  cells: [
    { key: "A" as const, label: "Current locations", campaignId: CAMPAIGNS[0].id },
    { key: "B" as const, label: "All Egypt", campaignId: CAMPAIGNS[3].id },
  ],
};

/** Every campaign in the account, including test cells. */
export const ALL_COSMETICS_CAMPAIGNS: string[] = CAMPAIGNS.map((c) => c.id);

