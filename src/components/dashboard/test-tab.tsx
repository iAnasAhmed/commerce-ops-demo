"use client";

import { FlaskConical, RefreshCw } from "lucide-react";

import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel, ScrollTable, SectionError, Stat, egp, pct, shortDay, useShared } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AB_TEST } from "@/lib/ab-test";
import type { CellStats, GrowthReport } from "@/lib/growth";
import { cn } from "@/lib/utils";

export type GrowthResponse = GrowthReport & { fetchedAt: string; stale: boolean; staleReason: string | null };

export function GrowthHeader({
  title,
  help,
  data,
  loading,
  onReload,
}: {
  title: string;
  help: string;
  data: GrowthResponse | null;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
          {title}
          <HelpTip label={title} text={help} />
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">
          {data
            ? `Meta + Shopify + Bosta · updated ${new Date(data.fetchedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${data.stale ? " · couldn't refresh, showing the last good pull" : ""}`
            : "Meta + Shopify + Bosta"}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReload} disabled={loading} aria-label="Reload">
        <RefreshCw className={loading ? "animate-spin" : ""} />
        <span className="hidden sm:inline">Reload</span>
      </Button>
    </div>
  );
}

export function GrowthLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

export function TestTab() {
  const { data, error, loading, reload } = useShared<GrowthResponse>("/api/growth");

  return (
    <div className="space-y-4">
      <GrowthHeader
        title="Location test"
        help="Meta's A/B test: the same ads and audience, only the location differs. Meta numbers are what Meta reports; Shopify and Bosta numbers are real orders and deliveries for the whole store during the test."
        data={data}
        loading={loading}
        onReload={() => void reload(true)}
      />
      {!data && loading && <GrowthLoading />}
      {!data && error && <SectionError message={error} />}
      {data && (data.abTest.ok ? <TestBody report={data.abTest.data} /> : <SectionError message={data.abTest.error} />)}
    </div>
  );
}

function TestBody({ report }: { report: Extract<GrowthReport["abTest"], { ok: true }>["data"] }) {
  const [a, b] = report.cells;
  const winnerCpp = a.purchases && b.purchases ? (a.cpp <= b.cpp ? "A" : "B") : null;
  const progress = report.day / report.totalDays;

  return (
    <>
      <section className="bg-card rounded-xl p-4 ring-1 ring-foreground/10 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <FlaskConical className="size-4" aria-hidden />
            {report.name}
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            Day {report.day} of {report.totalDays} · {shortDay(report.start)} → {shortDay(report.end)} · decide{" "}
            {shortDay(report.decisionDate)}
          </p>
        </div>
        <div className="bg-muted mt-3 h-2 overflow-hidden rounded-full" aria-hidden>
          <div className="bg-foreground h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
          {report.checkpoint}
        </p>
        <p className="text-muted-foreground mt-2 text-xs">Decision rule: {AB_TEST.rule}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {report.cells.map((cell) => (
          <CellCard key={cell.key} cell={cell} leading={winnerCpp === cell.key} />
        ))}
      </div>

      <Panel
        title="Real orders during the test"
        help="Every Shopify order placed since the test started (whole store, not only ads), and what Bosta did with it. Meta can't tell which version brought a Shopify order, so this is the reality check on both together."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Shopify orders" value={report.shopify.orders} />
          <Stat label="Delivered" value={report.shopify.delivered} tone="good" />
          <Stat label="Failed" value={report.shopify.failed} tone={report.shopify.failed ? "bad" : undefined} />
          <Stat label="On the way" value={report.shopify.open} />
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Meta claims {a.purchases + b.purchases} purchases across both versions for the same period.
          {a.purchases + b.purchases > report.shopify.orders ? " That's more than the store actually received." : ""}
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Daily, A vs B"
          help="Spend and Meta-reported purchases per day for each version. Source: Meta Ads."
        >
          <ScrollTable>
            <thead>
              <tr>
                <th>Day</th>
                <th>A spend</th>
                <th>A buys</th>
                <th>B spend</th>
                <th>B buys</th>
              </tr>
            </thead>
            <tbody>
              {a.daily.map((d) => {
                const bd = b.daily.find((x) => x.day === d.day);
                return (
                  <tr key={d.day} className="tabular-nums">
                    <td>{shortDay(d.day)}</td>
                    <td>{egp(d.spend)}</td>
                    <td className="font-medium">{d.purchases}</td>
                    <td>{egp(bd?.spend ?? 0)}</td>
                    <td className="font-medium">{bd?.purchases ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </ScrollTable>
        </Panel>

        <Panel
          title="Where each version spends"
          help="Facebook vs Instagram per version. Both have the same placements switched on; Meta chooses where the money goes. If the split is very different, part of any gap may be the platform, not the location."
        >
          <ScrollTable>
            <thead>
              <tr>
                <th>Version</th>
                <th>Platform</th>
                <th>Spend</th>
                <th>Carts</th>
                <th>Buys</th>
              </tr>
            </thead>
            <tbody>
              {report.cells.flatMap((c) =>
                c.platforms.map((p) => (
                  <tr key={`${c.key}-${p.name}`} className="tabular-nums">
                    <td>{c.key}</td>
                    <td className="capitalize">{p.name}</td>
                    <td>
                      {egp(p.spend)}{" "}
                      <span className="text-muted-foreground text-xs">({pct(c.spend ? p.spend / c.spend : 0)})</span>
                    </td>
                    <td>{p.addToCart}</td>
                    <td className="font-medium">{p.purchases}</td>
                  </tr>
                )),
              )}
            </tbody>
          </ScrollTable>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="B's spend by governorate"
          help="Where the all-Egypt version actually spends, from Meta. Meta can't attribute purchases by region reliably, so compare with real orders on the right."
        >
          <RegionTable cell={b} />
        </Panel>
        <Panel
          title="Real orders by governorate"
          help="Shopify orders placed during the test, grouped by the Bosta drop-off city, and how many were delivered. New governorates appearing here is the sign B is reaching new buyers."
        >
          <ScrollTable>
            <thead>
              <tr>
                <th>Governorate</th>
                <th>Orders</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {report.ordersByRegion.map((r) => (
                <tr key={r.name} className="tabular-nums">
                  <td>{r.name}</td>
                  <td className="font-medium">{r.orders}</td>
                  <td>{r.delivered}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </Panel>
      </div>
    </>
  );
}

function CellCard({ cell, leading }: { cell: CellStats; leading: boolean }) {
  return (
    <section
      className={cn(
        "bg-card rounded-xl p-4 ring-1 ring-foreground/10 sm:p-5",
        leading && "ring-2 ring-[var(--status-good)]/50",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold">
          <span className="bg-foreground text-background mr-2 inline-flex size-6 items-center justify-center rounded-full text-xs">
            {cell.key}
          </span>
          {cell.label}
        </p>
        {leading && (
          <span className="rounded-full bg-[var(--status-good)]/12 px-2 py-0.5 text-xs font-medium text-[var(--status-good)]">
            Lower cost per purchase
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Spend" value={egp(cell.spend)} />
        <Stat label="Purchases" value={cell.purchases} sub="Meta" />
        <Stat label="Cost / purchase" value={cell.purchases ? egp(cell.cpp) : "—"} />
        <Stat label="Add to cart" value={cell.addToCart} />
        <Stat label="Link clicks" value={cell.linkClicks} />
        <Stat label="CPM" value={egp(cell.cpm)} sub={`Freq. ${cell.frequency.toFixed(2)}`} />
      </div>
    </section>
  );
}

function RegionTable({ cell }: { cell: CellStats }) {
  const top = cell.regions.slice(0, 10);
  return (
    <ScrollTable>
      <thead>
        <tr>
          <th>Governorate</th>
          <th>Spend</th>
          <th>Share</th>
          <th>Clicks</th>
        </tr>
      </thead>
      <tbody>
        {top.map((r) => (
          <tr key={r.name} className="tabular-nums">
            <td>{r.name}</td>
            <td>{egp(r.spend)}</td>
            <td>{pct(cell.spend ? r.spend / cell.spend : 0)}</td>
            <td>{r.linkClicks}</td>
          </tr>
        ))}
      </tbody>
    </ScrollTable>
  );
}
