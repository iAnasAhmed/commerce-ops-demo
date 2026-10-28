"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Panel, ScrollTable, SectionError, Stat, egp, pct, shortDay, useShared } from "@/components/dashboard/panel";
import { GrowthHeader, GrowthLoading, type GrowthResponse } from "@/components/dashboard/test-tab";
import { Button } from "@/components/ui/button";
import type { GrowthReport } from "@/lib/growth";
import { cn } from "@/lib/utils";

type Ok<K extends keyof GrowthReport> = Extract<GrowthReport[K], { ok: true }>["data"];

export function InsightsTab() {
  const { data, error, loading, reload } = useShared<GrowthResponse>("/api/growth");

  return (
    <div className="space-y-4">
      <GrowthHeader
        title="Insights"
        help="Cross-checks that Meta alone can't give you: real orders vs Meta's claims, failed deliveries, tired ads, what changed, landing pages and stock. Cached for 10 minutes; Reload pulls fresh numbers."
        data={data}
        loading={loading}
        onReload={() => void reload(true)}
      />
      {!data && loading && <GrowthLoading />}
      {!data && error && <SectionError message={error} />}
      {data && (
        <>
          <MorningSummary data={data} />
          {data.truth.ok ? <Truth rows={data.truth.data} /> : <Failed title="Meta vs real orders" error={data.truth.error} />}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.fatigue.ok ? <Fatigue rows={data.fatigue.data} /> : <Failed title="Tired ads" error={data.fatigue.error} />}
            {data.stock.ok ? <Stock rows={data.stock.data} /> : <Failed title="Stock alerts" error={data.stock.error} />}
          </div>
          {data.deliveries.ok ? (
            <Deliveries report={data.deliveries.data} />
          ) : (
            <Failed title="Failed deliveries" error={data.deliveries.error} />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.changes.ok ? <Changes log={data.changes.data} /> : <Failed title="What changed in Meta" error={data.changes.error} />}
            {data.landing.ok ? <Landing report={data.landing.data} /> : <Failed title="Landing pages" error={data.landing.error} />}
          </div>
        </>
      )}
    </div>
  );
}

function Failed({ title, error }: { title: string; error: string }) {
  return (
    <Panel title={title} help="This block couldn't load. The rest of the page is unaffected.">
      <SectionError message={error} />
    </Panel>
  );
}

// ------------------------------------------------------------ morning summary

function buildSummary(data: GrowthResponse): string {
  const lines: string[] = [];
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  lines.push(`☀️ Velora — ${today}`, "");

  if (data.truth.ok) {
    const rows = data.truth.data;
    const y = rows[rows.length - 2];
    if (y) {
      const cost = y.shopifyOrders ? egp(y.spend / y.shopifyOrders) : "—";
      lines.push(
        `📦 Yesterday: ${y.shopifyOrders} orders · ${egp(y.spend)} ad spend · ${cost} per real order`,
        `   Meta claimed ${y.metaPurchases} purchases`,
      );
    }
    const week = rows.slice(-8, -1);
    const orders = week.reduce((s, r) => s + r.shopifyOrders, 0);
    const spend = week.reduce((s, r) => s + r.spend, 0);
    lines.push(`📅 Last 7 days: ${orders} orders · ${egp(spend)} spend`);
  }

  if (data.abTest.ok) {
    const t = data.abTest.data;
    const [a, b] = t.cells;
    lines.push(
      "",
      `🧪 Location test, day ${t.day}/${t.totalDays}`,
      `   A: ${a.purchases} buys · ${a.purchases ? egp(a.cpp) : "—"} each`,
      `   B: ${b.purchases} buys · ${b.purchases ? egp(b.cpp) : "—"} each`,
      `   ${t.checkpoint}`,
    );
  }

  if (data.fatigue.ok) {
    const tired = data.fatigue.data.filter((r) => r.signals.length);
    if (tired.length) {
      lines.push("", "😴 Ads getting tired:");
      tired.slice(0, 3).forEach((r) => lines.push(`   • ${r.name}: ${r.signals[0]}`));
    }
  }

  if (data.stock.ok && data.stock.data.length) {
    lines.push("", "📉 Low stock:");
    data.stock.data.slice(0, 4).forEach((r) =>
      lines.push(
        `   • ${r.product}${r.variant ? ` ${r.variant}` : ""}: ${r.quantity} left${r.daysLeft !== null ? ` (~${r.daysLeft} days)` : ""}`,
      ),
    );
  }

  if (data.deliveries.ok) {
    lines.push("", `🚚 Failed deliveries (last ${data.deliveries.data.windowDays} days): ${pct(data.deliveries.data.rate, 1)}`);
  }
  return lines.join("\n");
}

function MorningSummary({ data }: { data: GrowthResponse }) {
  const [copied, setCopied] = useState(false);
  const text = buildSummary(data);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Panel
      title="Morning summary"
      help="Yesterday's results, the test, tired ads, low stock and failed deliveries in one message. Copy it and paste into WhatsApp."
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-lg bg-[#25D366] px-3 text-sm font-medium text-white"
          >
            WhatsApp
          </a>
        </div>
      }
    >
      <pre className="bg-muted/40 max-h-64 overflow-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
    </Panel>
  );
}

// ------------------------------------------------------------ 2. truth

function Truth({ rows }: { rows: Ok<"truth"> }) {
  const week = rows.slice(-7);
  const meta = week.reduce((s, r) => s + r.metaPurchases, 0);
  const orders = week.reduce((s, r) => s + r.shopifyOrders, 0);
  const spend = week.reduce((s, r) => s + r.spend, 0);
  const delivered = week.reduce((s, r) => s + r.delivered, 0);
  const inflation = orders ? meta / orders - 1 : 0;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.metaPurchases, r.shopifyOrders)));

  return (
    <Panel
      title="Meta vs real orders"
      help="Each day: purchases Meta says its ads brought, against every order Shopify actually received (whole store, cancelled excluded), and what Bosta has delivered so far. If Meta's number is higher than Shopify's, Meta is over-counting — judge ads on the real numbers."
      subtitle="Last 7 days, including today"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Meta says" value={meta} sub="purchases" />
        <Stat label="Shopify got" value={orders} sub="orders" />
        <Stat
          label="Meta over-counts"
          value={orders ? pct(inflation) : "—"}
          tone={inflation > 0.1 ? "bad" : inflation < -0.1 ? "good" : undefined}
          sub={inflation > 0 ? "more than real" : "fewer than real"}
        />
        <Stat label="Real cost / order" value={orders ? egp(spend / orders) : "—"} sub={`${delivered} delivered so far`} />
      </div>

      <div className="mt-4 space-y-1.5">
        {rows.map((r) => (
          <div key={r.day} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-xs tabular-nums">
            <span className="text-muted-foreground">{shortDay(r.day)}</span>
            <div className="space-y-0.5">
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${(r.metaPurchases / max) * 100}%` }} />
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div className="bg-foreground h-full rounded-full" style={{ width: `${(r.shopifyOrders / max) * 100}%` }} />
              </div>
            </div>
            <span className="w-24 text-right">
              <span className="text-sky-600">{r.metaPurchases}</span> / <strong>{r.shopifyOrders}</strong>
              <span className="text-muted-foreground"> · {egp(r.spend)}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-500" /> Meta purchases
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground size-2 rounded-full" /> Shopify orders
        </span>
        <span>· ad spend</span>
      </p>
    </Panel>
  );
}

// ------------------------------------------------------------ 3. deliveries

function Deliveries({ report }: { report: Ok<"deliveries"> }) {
  return (
    <Panel
      title="Failed deliveries"
      help="Bosta parcels that finished (delivered, or returned / cancelled after leaving), by drop-off city and by product. Every failed parcel still costs about EGP 105 in Bosta fees. Areas or products with a high rate are candidates for asking Instapay upfront, or leaving out of ads."
      subtitle={`Parcels created in the last ${report.windowDays} days${report.since ? ` (from ${shortDay(report.since)})` : ""} · only cities and products with 3+ finished parcels`}
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Delivered" value={report.delivered} tone="good" />
        <Stat label="Failed" value={report.failed} tone="bad" />
        <Stat label="Failure rate" value={pct(report.rate, 1)} tone={report.rate > 0.12 ? "bad" : undefined} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <FailTable title="By city" rows={report.byCity} overall={report.rate} />
        <FailTable title="By product" rows={report.byProduct} overall={report.rate} />
      </div>
    </Panel>
  );
}

function FailTable({ title, rows, overall }: { title: string; rows: Ok<"deliveries">["byCity"]; overall: number }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-sm font-medium">{title}</p>
      <ScrollTable>
        <thead>
          <tr>
            <th>{title.replace("By ", "")}</th>
            <th>Delivered</th>
            <th>Failed</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r) => (
            <tr key={r.name} className="tabular-nums">
              <td className="max-w-[12rem] truncate">{r.name}</td>
              <td>{r.delivered}</td>
              <td>{r.failed}</td>
              <td className={cn("font-medium", r.rate > overall * 1.5 && r.failed >= 2 && "text-[var(--status-critical)]")}>
                {pct(r.rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </ScrollTable>
    </div>
  );
}

// ------------------------------------------------------------ 8. fatigue

function Fatigue({ rows }: { rows: Ok<"fatigue"> }) {
  const tired = rows.filter((r) => r.signals.length);
  return (
    <Panel
      title="Tired ads"
      help="Ads that spent EGP 300+ in the last 7 days, compared with the 7 days before. Flags: people seeing it 3+ times, click rate down 20%+, cost per purchase up 30%+, or frequency climbing fast. A tired ad needs a fresh video, not a bigger budget. Source: Meta Ads."
      subtitle={tired.length ? `${tired.length} ad${tired.length === 1 ? "" : "s"} showing signs` : "No ad is showing signs of tiring"}
    >
      <div className="space-y-2">
        {rows.slice(0, 8).map((r) => (
          <div key={r.id} className={cn("rounded-lg px-3 py-2", r.signals.length ? "bg-amber-50 dark:bg-amber-500/10" : "bg-muted/40")}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="min-w-0 truncate text-sm font-medium">{r.name}</p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {egp(r.spend)} · freq {r.frequency.toFixed(1)} · CTR {r.ctr.toFixed(2)}%
                {r.cpp ? ` · ${egp(r.cpp)}/buy` : ""}
              </p>
            </div>
            <p className="text-muted-foreground text-xs">{r.campaignName}</p>
            {r.signals.map((s) => (
              <p key={s} className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                • {s}
              </p>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ 11. stock

function Stock({ rows }: { rows: Ok<"stock"> }) {
  return (
    <Panel
      title="Stock alerts"
      help="Active products with 10 or fewer left, or less than about two weeks of stock at the last 14 days' sales pace. Refill or pause ads for these before customers order something you can't send. Source: Shopify inventory and orders."
      subtitle={rows.length ? `${rows.length} item${rows.length === 1 ? "" : "s"} running low` : "Nothing running low"}
    >
      {rows.length > 0 && (
        <ScrollTable>
          <thead>
            <tr>
              <th>Product</th>
              <th>Left</th>
              <th>Sold 14d</th>
              <th>Days left</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r) => (
              <tr key={`${r.product}-${r.variant}`} className="tabular-nums">
                <td className="max-w-[14rem] truncate">
                  {r.product}
                  {r.variant && <span className="text-muted-foreground"> · {r.variant}</span>}
                </td>
                <td className={cn("font-medium", r.quantity <= 3 && "text-[var(--status-critical)]")}>{r.quantity}</td>
                <td>{r.soldLast14}</td>
                <td>{r.daysLeft ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------ 9. changes

function Changes({ log }: { log: Ok<"changes"> }) {
  const max = Math.max(1, ...log.days.map((d) => d.orders));
  return (
    <Panel
      title="What changed in Meta"
      help="Every budget, status, targeting or bid change on the cosmetics campaigns in the last 14 days, next to that day's Shopify orders. Changes reset Meta's learning, so a dip right after one is often the change, not the ads. Source: Meta activity log + Shopify."
    >
      <div className="space-y-1">
        {log.days.map((d) => (
          <div key={d.day} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-xs tabular-nums">
            <span className="text-muted-foreground">{shortDay(d.day)}</span>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div className="bg-foreground h-full rounded-full" style={{ width: `${(d.orders / max) * 100}%` }} />
            </div>
            <span className="w-24 text-right">
              {d.orders} orders
              {d.changes > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">{d.changes}✎</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
        {log.events.length === 0 && <p className="text-muted-foreground text-sm">No changes in the last 14 days.</p>}
        {log.events.map((e, i) => (
          <div key={`${e.time}-${i}`} className="border-border border-l-2 pl-3 text-xs">
            <p className="font-medium">
              {e.event}
              {e.detail && <span className="text-muted-foreground font-normal"> · {e.detail}</span>}
            </p>
            <p className="text-muted-foreground">
              {e.objectName} · {new Date(e.time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {e.actor ? ` · ${e.actor}` : ""}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ 10. landing

function Landing({ report }: { report: Ok<"landing"> }) {
  return (
    <Panel
      title="Landing pages"
      help="Where visitors first land, how many of those visits added to cart, and how many orders came from each page, over the last 14 days. If product pages convert better than the homepage, point ads straight at them. Source: Shopify."
      subtitle="Last 14 days"
    >
      {report.note && <p className="text-muted-foreground mb-2 text-xs">{report.note}</p>}
      <ScrollTable>
        <thead>
          <tr>
            <th>Page</th>
            {report.source === "sessions" && (
              <>
                <th>Visits</th>
                <th>Add to cart</th>
              </>
            )}
            <th>Orders</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.page} className="tabular-nums">
              <td className="max-w-[14rem] truncate">{r.page}</td>
              {report.source === "sessions" && (
                <>
                  <td>{r.sessions}</td>
                  <td>{r.cartRate !== null ? pct(r.cartRate, 1) : "—"}</td>
                </>
              )}
              <td className="font-medium">{r.orders}</td>
            </tr>
          ))}
        </tbody>
      </ScrollTable>
    </Panel>
  );
}
