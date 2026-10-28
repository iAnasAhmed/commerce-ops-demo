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
  adCppCeiling: number;
  adMinSpendToJudge: number;
  adSetCppGood: number;
}

/** The verdict column — so the kill decisions read themselves off the table. */
function verdict(ad: MetaInsight, t: Thresholds) {
  if (ad.spend < t.adMinSpendToJudge) {
    return { label: "Too early", tone: "muted" as const };
  }
  if (ad.cpp > t.adCppCeiling) return { label: "Pause", tone: "critical" as const };
  if (ad.cpp <= t.adSetCppGood) return { label: "Scale", tone: "good" as const };
  return { label: "Hold", tone: "warning" as const };
}

const toneClass = {
  good: "border-transparent bg-[var(--status-good)]/12 text-[var(--status-good)]",
  warning:
    "border-transparent bg-[var(--status-warning)]/18 text-[var(--status-warning)]",
  critical:
    "border-transparent bg-[var(--status-critical)]/12 text-[var(--status-critical)]",
  muted: "border-transparent bg-muted text-muted-foreground",
};

export function AdTable({
  ads,
  thresholds,
  rtoRate,
}: {
  ads: MetaInsight[];
  thresholds: Thresholds;
  rtoRate: number;
}) {
  const live = ads.filter((a) => a.spend > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Ads, last 7 days
          <HelpTip label="Ads, last 7 days" text="Every ad over the last 7 days with spend, purchases and cost per purchase. Verdict: too little spend to judge → too early; cost per purchase above the ceiling → pause; at or below the good line → scale; otherwise hold. Source: Meta Ads." />
        </CardTitle>
        <CardDescription>
          Sorted by spend. Real CPP adds the {(rtoRate * 100).toFixed(2)}%
          failed-delivery rate, so it reflects a delivered order rather than a
          placed one.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Ad</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Purch.</TableHead>
                <TableHead className="text-right">CPP</TableHead>
                <TableHead className="text-right">Real CPP</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Freq.</TableHead>
                <TableHead className="text-right">Verdict</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {live.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground py-8 text-center"
                  >
                    No ads with spend in this window.
                  </TableCell>
                </TableRow>
              )}

              {live.map((ad) => {
                const v = verdict(ad, thresholds);
                const overCeiling =
                  ad.spend >= thresholds.adMinSpendToJudge &&
                  ad.cpp > thresholds.adCppCeiling;

                return (
                  <TableRow key={ad.id}>
                    <TableCell className="font-medium">
                      {ad.name}
                      {/* Ads from three campaigns share this table, so the
                          campaign has to be visible or a verdict is unreadable. */}
                      {ad.campaignName && (
                        <span className="text-muted-foreground block text-xs font-normal">
                          {ad.campaignName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEgp(ad.spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ad.purchases}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        overCeiling &&
                          "font-semibold text-[var(--status-critical)]",
                      )}
                    >
                      {ad.purchases ? formatEgp(ad.cpp) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {ad.purchases ? formatEgp(ad.cpp / (1 - rtoRate)) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ad.roas ? `${ad.roas.toFixed(2)}x` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(ad.ctr, 2)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(ad.frequency, 2)}
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
      </CardContent>
    </Card>
  );
}
