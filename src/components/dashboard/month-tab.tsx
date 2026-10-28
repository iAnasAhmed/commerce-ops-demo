"use client";

import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";

import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel, ScrollTable, SectionError, egp, pct, shortDay, useShared } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MonthReport, MonthTotals } from "@/lib/month";
import { cn } from "@/lib/utils";
import { AnimatedValue } from "@/components/dashboard/animated-value";

type Response = MonthReport & { role: string; fetchedAt: string; stale: boolean };

const number = (n: number) => Math.round(n).toLocaleString("en-US");

/** Signed change vs the same stretch of last month. */
function delta(now: number, before: number): number | null {
  if (!before) return null;
  return (now - before) / before;
}

export function MonthTab() {
  const { data, error, loading, reload } = useShared<Response>("/api/month");

  if (!data && loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <SectionError message={error ?? "Could not load this month"} />
        <Button variant="outline" size="sm" onClick={() => void reload(true)} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Try again
        </Button>
      </div>
    );
  }

  const { current, previousToDate } = data;
  const paceShare = data.dayOfMonth / data.daysInMonth;
  const projected = paceShare > 0 ? current.netSales / paceShare : 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground hidden text-xs font-medium tracking-[0.2em] uppercase md:block">
            Month so far
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{current.label}</h2>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            Day {data.dayOfMonth} of {data.daysInMonth} · updated{" "}
            {new Date(data.fetchedAt).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {data.stale ? " · showing the last good update" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload(true)} disabled={loading} aria-label="Reload">
          <RefreshCw className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Reload</span>
        </Button>
      </header>

      {/* The headline: what the brand has actually sold this month. */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#f7e9ef] via-[#fbf5f2] to-[#eef1fb] p-6 ring-1 ring-foreground/10 sm:p-8 dark:from-[#2a1f27] dark:via-[#23202a] dark:to-[#1e2230]">
        <div className="grid gap-6 sm:grid-cols-2 sm:items-end">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground/70">
              Sales this month
              <HelpTip
                label="Sales this month"
                text="Everything the store has sold since the 1st, before delivery costs and any orders that come back. Source: Shopify orders, cancelled ones excluded."
              />
            </p>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {egp(current.grossSales)}
            </p>
            <Trend now={current.grossSales} before={previousToDate.grossSales} label="vs same point last month" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Hero label="Orders" value={number(current.orders)} now={current.orders} before={previousToDate.orders} />
            <Hero
              label="Average order"
              value={egp(current.averageOrderValue)}
              now={current.averageOrderValue}
              before={previousToDate.averageOrderValue}
            />
          </div>
        </div>

        <p className="text-muted-foreground mt-6 text-xs sm:text-sm">
          At this pace the month finishes around <strong className="text-foreground">{egp(projected)}</strong> in net
          sales. Last month ended at {egp(data.previous.netSales)}.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Net sales"
          value={egp(current.netSales)}
          help="Sales minus delivery charges and minus any order that came back or was refused. This is the money the brand actually keeps from orders. Source: Shopify + Bosta."
          now={current.netSales}
          before={previousToDate.netSales}
          emphasis
        />
        <Metric
          label="Delivered"
          value={number(current.deliveredOrders)}
          help="Orders Bosta has already handed to the customer and collected for. Source: Bosta."
          sub={`${number(current.openOrders)} still on the way`}
        />
        <Metric
          label="Came back"
          value={number(current.failedOrders)}
          help="Orders refused or returned, so no money was collected. The value shown is what those orders were worth. Source: Bosta."
          sub={current.failedOrders ? egp(current.failedValue) : "None so far"}
          tone={current.failedOrders ? "bad" : "good"}
        />
        <Metric
          label="DM & Instapay orders"
          value={number(current.dmOrders)}
          help="Orders paid by Instapay or taken by hand rather than card at checkout. Source: Shopify payment method."
          sub={current.dmOrders ? egp(current.dmSales) : "None so far"}
        />
      </section>

      {data.ads && (
        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Ad spend" value={egp(data.ads.spend)} help="Owner only. Meta spend on the cosmetics campaigns this month." />
          <Metric
            label="Cost per purchase"
            value={data.ads.purchases ? egp(data.ads.costPerPurchase) : "—"}
            help="Owner only. Meta spend ÷ Meta-reported purchases this month."
          />
          <Metric
            label="MER"
            value={`${data.ads.mer.toFixed(2)}x`}
            help="Owner only. Net sales ÷ ad spend — the sheet's MER line."
            emphasis
          />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Day by day"
          help="Orders and sales for each day of the month so far. The tallest bar is the best day. Source: Shopify."
        >
          <DailyBars rows={current.daily} />
        </Panel>

        <Panel
          title="Best sellers this month"
          help="Every product sold since the 1st, by how much money it brought in. Units is how many pieces went out. Source: Shopify order line items."
        >
          <ScrollTable>
            <thead>
              <tr>
                <th>Product</th>
                <th>Units</th>
                <th>Orders</th>
                <th>Sales</th>
              </tr>
            </thead>
            <tbody>
              {current.products.slice(0, 12).map((p) => (
                <tr key={p.title} className="tabular-nums">
                  <td className="max-w-[16rem] truncate">{p.title}</td>
                  <td>{p.units}</td>
                  <td>{p.orders}</td>
                  <td className="font-medium">{egp(p.sales)}</td>
                </tr>
              ))}
              {current.products.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground py-4 text-center">
                    No orders yet this month.
                  </td>
                </tr>
              )}
            </tbody>
          </ScrollTable>
        </Panel>
      </div>

      <Panel
        title="Visitors and checkout"
        help="How many people visited the store this month, how many added something to the basket, and how many finished the order. Source: Shopify."
        subtitle={data.funnel.note ?? undefined}
      >
        {data.funnel.sessions === null ? (
          <p className="text-muted-foreground text-sm">Visit numbers aren&apos;t available yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Step label="Visits" value={number(data.funnel.sessions)} />
            <Step
              label="Added to basket"
              value={number(data.funnel.addedToCart ?? 0)}
              sub={pct((data.funnel.addedToCart ?? 0) / Math.max(1, data.funnel.sessions), 1)}
            />
            <Step
              label="Reached checkout"
              value={number(data.funnel.reachedCheckout ?? 0)}
              sub={pct((data.funnel.reachedCheckout ?? 0) / Math.max(1, data.funnel.sessions), 1)}
            />
            <Step
              label="Ordered"
              value={number(data.funnel.completedCheckout ?? 0)}
              sub={data.funnel.conversionRate !== null ? pct(data.funnel.conversionRate, 2) : undefined}
            />
          </div>
        )}
      </Panel>

      <Panel
        title="This month against last month"
        help="The same numbers for the whole of last month, and for the same number of days into last month — the fair comparison while the month is still running. Source: Shopify + Bosta."
      >
        <ScrollTable>
          <thead>
            <tr>
              <th></th>
              <th>{current.label}</th>
              <th>Same days last month</th>
              <th>All of {data.previous.label}</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Orders", (m: MonthTotals) => number(m.orders)],
                ["Sales", (m: MonthTotals) => egp(m.grossSales)],
                ["Net sales", (m: MonthTotals) => egp(m.netSales)],
                ["Average order", (m: MonthTotals) => egp(m.averageOrderValue)],
                ["Delivered", (m: MonthTotals) => number(m.deliveredOrders)],
                ["Came back", (m: MonthTotals) => number(m.failedOrders)],
              ] as const
            ).map(([label, render]) => (
              <tr key={label} className="tabular-nums">
                <td className="text-muted-foreground">{label}</td>
                <td className="font-semibold">{render(current)}</td>
                <td>{render(previousToDate)}</td>
                <td className="text-muted-foreground">{render(data.previous)}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      </Panel>
    </div>
  );
}

function Hero({ label, value, now, before }: { label: string; value: string; now: number; before: number }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground/70">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl"><AnimatedValue value={value} /></p>
      <Trend now={now} before={before} label="vs last month" small />
    </div>
  );
}

function Trend({
  now,
  before,
  label,
  small,
}: {
  now: number;
  before: number;
  label: string;
  small?: boolean;
}) {
  const change = delta(now, before);
  if (change === null) return null;
  const up = change >= 0;
  return (
    <p
      className={cn(
        "mt-1.5 flex items-center gap-1 font-medium tabular-nums",
        small ? "text-xs" : "text-sm",
        up ? "text-[var(--status-good)]" : "text-[var(--status-critical)]",
      )}
    >
      {up ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
      {up ? "+" : ""}
      {(change * 100).toFixed(0)}%
      <span className="text-muted-foreground font-normal">{label}</span>
    </p>
  );
}

function Metric({
  label,
  value,
  help,
  sub,
  now,
  before,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  help: string;
  sub?: string;
  now?: number;
  before?: number;
  tone?: "good" | "bad";
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-card min-w-0 rounded-xl p-4 ring-1 ring-foreground/10",
        emphasis && "bg-muted/40 ring-foreground/20",
      )}
    >
      <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        {label}
        <HelpTip label={label} text={help} />
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tracking-tight tabular-nums",
          tone === "good" && "text-[var(--status-good)]",
          tone === "bad" && "text-[var(--status-critical)]",
        )}
      >
        <AnimatedValue value={value} />
      </p>
      {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
      {typeof now === "number" && typeof before === "number" && (
        <Trend now={now} before={before} label="vs last month" small />
      )}
    </div>
  );
}

function Step({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-lg px-3 py-2.5 text-center">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-muted-foreground text-xs tabular-nums">{sub}</p>}
    </div>
  );
}

function DailyBars({ rows }: { rows: MonthTotals["daily"] }) {
  const max = Math.max(1, ...rows.map((r) => r.sales));
  if (rows.length === 0) return <p className="text-muted-foreground py-4 text-sm">No orders yet this month.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.day} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-xs tabular-nums">
          <span className="text-muted-foreground">{shortDay(r.day)}</span>
          <div className="bg-muted h-2.5 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#d98aa8] to-[#8aa6d9]"
              style={{ width: `${(r.sales / max) * 100}%` }}
            />
          </div>
          <span className="w-28 text-right">
            <strong>{egp(r.sales)}</strong>
            <span className="text-muted-foreground"> · {r.orders}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
