"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MetaInsight } from "@/lib/meta";
import { formatEgp } from "@/lib/metrics";
import { HelpTip } from "@/components/dashboard/help-tip";

// One series, so no legend — the title names it.
const chartConfig = {
  cpp: { label: "Cost per purchase", color: "var(--chart-1)" },
} satisfies ChartConfig;

function weekLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function CppTrendChart({
  trend,
  ceiling,
}: {
  trend: MetaInsight[];
  ceiling: number;
}) {
  const data = trend
    .filter((w) => w.purchases > 0)
    .map((w) => ({
      week: weekLabel(w.dateStart),
      cpp: Math.round(w.cpp),
      purchases: w.purchases,
      spend: Math.round(w.spend),
    }));

  const latest = data.at(-1);
  const first = data[0];
  const direction =
    latest && first && first.cpp > 0
      ? ((latest.cpp - first.cpp) / first.cpp) * 100
      : 0;

  // The kill line is only useful if it is actually on the chart, so make sure
  // the scale reaches it even when every week sits comfortably below.
  const dataMax = data.reduce((m, d) => Math.max(m, d.cpp), 0);
  const yMax = Math.ceil((Math.max(dataMax, ceiling) * 1.08) / 25) * 25;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Cost per purchase, by week
          <HelpTip label="Cost per purchase, by week" text="Meta ad spend ÷ Meta-reported purchases, for each complete week. The dashed line is the ceiling above which an ad should be paused. Rising cost at the same spend usually means the audience is tired of the ads. Source: Meta Ads." />
        </CardTitle>
        <CardDescription>
          {data.length
            ? `${direction >= 0 ? "Up" : "Down"} ${Math.abs(direction).toFixed(0)}% from the first week shown to the latest. A rising line at flat spend is audience saturation.`
            : "No completed weeks with purchases yet."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <LineChart data={data} margin={{ left: 4, right: 16, top: 8 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.4} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={44}
              domain={[0, yMax]}
              className="text-xs"
            />
            {/* The line you do not want to cross, drawn where you can see it. */}
            <ReferenceLine
              y={ceiling}
              strokeDasharray="4 4"
              stroke="var(--status-critical)"
              strokeWidth={1.5}
              label={{
                value: `Kill line ${ceiling}`,
                position: "insideTopRight",
                fill: "var(--status-critical)",
                fontSize: 11,
              }}
            />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  formatter={(value) => formatEgp(Number(value))}
                  labelFormatter={(label) => `Week of ${label}`}
                />
              }
            />
            <Line
              dataKey="cpp"
              type="monotone"
              stroke="var(--color-cpp)"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "var(--color-cpp)" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
