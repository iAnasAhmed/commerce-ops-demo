import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { MetaInsight } from "@/lib/meta";
import { formatEgp, formatNumber } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/dashboard/help-tip";

interface Thresholds {
  adSetCppGood: number;
  adSetCppKill: number;
  frequencyCeiling: number;
}

/**
 * The verdict is read against the *incumbent* campaign, not a fixed number.
 *
 * A new campaign matching the campaign it is meant to beat is parity, not
 * success — so the benchmark is the best CPP among campaigns with enough
 * purchases to mean anything, and each campaign is judged against that.
 */
function verdict(
  campaign: MetaInsight,
  benchmarkCpp: number | null,
  t: Thresholds,
) {
  if (campaign.purchases < 5) {
    return { label: "Too early", tone: "muted" as const };
  }
  if (campaign.cpp > t.adSetCppKill) {
    return { label: "Failing", tone: "critical" as const };
  }
  if (benchmarkCpp && campaign.cpp > benchmarkCpp * 1.15) {
    return { label: "Behind", tone: "warning" as const };
  }
  if (campaign.cpp <= t.adSetCppGood) {
    return { label: "Winning", tone: "good" as const };
  }
  return { label: "Holding", tone: "warning" as const };
}

const toneClass = {
  good: "border-transparent bg-[var(--status-good)]/12 text-[var(--status-good)]",
  warning:
    "border-transparent bg-[var(--status-warning)]/18 text-[var(--status-warning)]",
  critical:
    "border-transparent bg-[var(--status-critical)]/12 text-[var(--status-critical)]",
  muted: "border-transparent bg-muted text-muted-foreground",
};

export function CampaignTable({
  campaigns,
  thresholds,
  rtoRate,
}: {
  campaigns: MetaInsight[];
  thresholds: Thresholds;
  rtoRate: number;
}) {
  const live = campaigns.filter((c) => c.spend > 0);

  // Only campaigns with real conversion volume can set the bar.
  const benchmarkCpp =
    live
      .filter((c) => c.purchases >= 10 && c.cpp > 0)
      .reduce<number | null>(
        (best, c) => (best === null || c.cpp < best ? c.cpp : best),
        null,
      ) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Campaigns, last 7 days
          <HelpTip label="Campaigns, last 7 days" text="Each cosmetics campaign over the last 7 days. CPP = spend ÷ purchases Meta reports. Real CPP adds the failed-delivery rate. ROAS = purchase value ÷ spend (Meta's own figure). Freq. = average times each person saw an ad. Verdict: under 5 purchases is too early; above the kill line is failing; more than 15% worse than the best campaign is behind. Source: Meta Ads." />
        </CardTitle>
        <CardDescription>
          {benchmarkCpp
            ? `Judged against the best performing campaign at ${formatEgp(benchmarkCpp)} cost per purchase. "Behind" means more than 15% worse than that.`
            : "No campaign has enough purchases yet to set a benchmark."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {live.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No campaign has spent yet in this window.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">CPP</TableHead>
                  <TableHead className="text-right">Real CPP</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">Freq.</TableHead>
                  <TableHead className="text-right">Verdict</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {live.map((campaign) => {
                  const v = verdict(campaign, benchmarkCpp, thresholds);
                  const overFrequency =
                    campaign.frequency > thresholds.frequencyCeiling;

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">
                        {campaign.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEgp(campaign.spend)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(campaign.purchases)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {campaign.cpp ? formatEgp(campaign.cpp) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {campaign.cpp
                          ? formatEgp(campaign.cpp / (1 - rtoRate))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {campaign.roas ? `${campaign.roas.toFixed(2)}x` : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          overFrequency && "text-[var(--status-warning)]",
                        )}
                      >
                        {formatNumber(campaign.frequency, 2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={toneClass[v.tone]}>{v.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
