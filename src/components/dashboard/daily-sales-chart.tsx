"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
import { formatEgp } from "@/lib/metrics";
import type { ShopifyWindow } from "@/lib/shopify";
import { HelpTip } from "@/components/dashboard/help-tip";

const chartConfig = {
  sales: { label: "Gross sales", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function DailySalesChart({ window }: { window: ShopifyWindow }) {
  const data = window.daily.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    sales: Math.round(d.sales),
    orders: d.orders,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Daily gross sales
          <HelpTip label="Daily gross sales" text="Value of all Shopify orders placed each day over the last 30 days, before cancellations, refunds and failed deliveries. Whole store, not only ads. Source: Shopify orders." />
        </CardTitle>
        <CardDescription>
          Shopify gross, before the failed-delivery deduction. Flat days usually
          mean ads were off.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.4} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              interval="preserveStartEnd"
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={56}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              className="text-xs"
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) => formatEgp(Number(value))}
                />
              }
            />
            {/* 4px rounded data-end, anchored to the baseline. */}
            <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
