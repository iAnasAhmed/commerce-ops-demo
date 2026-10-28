"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { ActionNeededTab } from "@/components/dashboard/action-needed-tab";
import { BottomNav, NAV_TABS } from "@/components/dashboard/bottom-nav";
import { CustomersTab } from "@/components/dashboard/customers-tab";
import { InsightsTab } from "@/components/dashboard/insights-tab";
import { MonthTab } from "@/components/dashboard/month-tab";
import { PeopleTab } from "@/components/dashboard/people-tab";
import { TestTab } from "@/components/dashboard/test-tab";
import { OrderIssuesTab } from "@/components/dashboard/order-issues-tab";
import { InstapayTab } from "@/components/dashboard/instapay-tab";
import { AdTable } from "@/components/dashboard/ad-table";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { CampaignTable } from "@/components/dashboard/campaign-table";
import { CppTrendChart } from "@/components/dashboard/cpp-trend-chart";
import { DailySalesChart } from "@/components/dashboard/daily-sales-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { CampaignSettings, MetaInsight } from "@/lib/meta";
import type { Alert, TrueMetrics } from "@/lib/metrics";
import { formatEgp, formatNumber } from "@/lib/metrics";
import type { ShopifyWindow } from "@/lib/shopify";

interface DashboardPayload {
  generatedAt: string;
  rtoRate: number;
  thresholds: {
    adCppCeiling: number;
    adMinSpendToJudge: number;
    adSetCppGood: number;
    adSetCppKill: number;
    frequencyCeiling: number;
  };
  learningPhaseDailyBudget: number | null;
  meta: {
    last7: MetaInsight | null;
    last30: MetaInsight | null;
    campaigns7: MetaInsight[];
    campaigns30: MetaInsight[];
    campaignsToday: MetaInsight[];
    settings: CampaignSettings[];
    ads7: MetaInsight[];
    trend: MetaInsight[];
  };
  shopify: { last7: ShopifyWindow; last30: ShopifyWindow };
  truth: { last7: TrueMetrics; last30: TrueMetrics };
  alerts: Alert[];
}

interface ApiError {
  error: string;
  message: string;
  missing?: string[];
}

/** Pure fetch — no state touched, so it is safe to call from an effect body. */
async function fetchDashboard(): Promise<{
  data?: DashboardPayload;
  error?: ApiError;
}> {
  try {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    const json = await res.json();
    return res.ok
      ? { data: json as DashboardPayload }
      : { error: json as ApiError };
  } catch (e) {
    return {
      error: {
        error: "network",
        message: e instanceof Error ? e.message : "Request failed",
      },
    };
  }
}

const TAB_IDS = new Set(NAV_TABS.map((t) => t.id));

interface Me {
  email: string;
  role: "owner" | "client" | "support";
  tabs: string[];
}

export function DashboardClient() {
  const [tab, setTab] = useState("month");
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  /** Manual refresh — the spinner is wanted here. */
  async function load() {
    setLoading(true);
    setError(null);
    const result = await fetchDashboard();
    if (result.data) setData(result.data);
    if (result.error) setError(result.error);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json()) as Me & { message?: string; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setMeError(json.message ?? json.error ?? "No access");
          return;
        }
        setMe(json);
      } catch {
        if (!cancelled) setMeError("Could not check your access");
      }
    })();

    // Open the tab named in the link (#insights), else the last one used.
    const fromHash = window.location.hash.slice(1);
    let remembered: string | null = null;
    try {
      remembered = window.localStorage.getItem("dashboard-tab");
    } catch {}
    const initial = TAB_IDS.has(fromHash) ? fromHash : remembered && TAB_IDS.has(remembered) ? remembered : null;
    if (initial) queueMicrotask(() => setTab(initial));

    void (async () => {
      const result = await fetchDashboard();
      if (cancelled) return;
      if (result.data) setData(result.data);
      if (result.error) setError(result.error);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The Meta and Shopify payload only feeds Live and Plan. Action Needed reads
   * Bosta and Brand is static, so a Meta outage (an expired token, a missing
   * permission) must not take those tabs down with it — the header and tabs
   * always render, and only the tabs that need this payload show the error.
   */
  function changeTab(next: string) {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
    try {
      window.localStorage.setItem("dashboard-tab", next);
    } catch {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (meError) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Velora Cosmetics · demo</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{meError}</p>
        <p className="text-muted-foreground mt-2 text-xs">
          Signed in with the wrong account? Sign out of Google and open the link again.
        </p>
      </div>
    );
  }

  const visibleTabs = NAV_TABS.filter((t) => !me || me.tabs.includes(t.id));
  // If the remembered tab isn't allowed for this person, fall back to the first one they can see.
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : (visibleTabs[0]?.id ?? "month");

  const metaState = data ? null : loading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState error={error} onRetry={load} />
  ) : null;

  const activeCampaignCount = data
    ? new Set([
        ...data.meta.campaigns7.map((c) => c.id),
        ...(data.meta.campaignsToday ?? []).map((c) => c.id),
      ]).size
    : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex items-start justify-between gap-3 sm:items-end">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Velora Cosmetics · demo
          </h1>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            {data ? (
              <>
                {/*
                  Counted across both windows. Meta's `last_7d` preset excludes
                  today, so a campaign that launched this morning is missing from
                  campaigns7 entirely and the header would read "1 campaign" on
                  the day it matters most.
                */}
                {activeCampaignCount} campaign{activeCampaignCount === 1 ? "" : "s"} · last 7 days · updated{" "}
                {new Date(data.generatedAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </>
            ) : loading ? (
              me && me.role !== "owner" ? (
                "Loading…"
              ) : (
                "Loading ad data…"
              )
            ) : me && me.role !== "owner" ? (
              "Sales results for this month"
            ) : (
              "Ad data unavailable — the Action Needed tab still works"
            )}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          aria-label="Refresh ad data"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => changeTab(String(v))} className="gap-5 sm:gap-6">
        {/* Desktop and tablet: tabs across the top. Phones use the bottom bar. */}
        <div className="-mx-4 hidden overflow-x-auto px-4 pb-1.5 [scrollbar-width:none] sm:mx-0 sm:px-0 md:block [&::-webkit-scrollbar]:hidden">
          <TabsList variant="line" className="min-w-max">
            {visibleTabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="px-3">
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Phones: which section you're in, above the content. */}
        <p className="text-muted-foreground -mb-2 text-[11px] font-semibold tracking-wider uppercase md:hidden">
          {visibleTabs.find((t) => t.id === activeTab)?.label}
        </p>

        <TabsContent value="month">
          <MonthTab />
        </TabsContent>

        <TabsContent value="people">
          <PeopleTab />
        </TabsContent>

        <TabsContent value="test">
          <TestTab />
        </TabsContent>

        <TabsContent value="insights">
          <InsightsTab />
        </TabsContent>

        <TabsContent value="customers">
          <CustomersTab />
        </TabsContent>

        <TabsContent value="live" className="space-y-6">
          {data ? <LiveTab data={data} /> : metaState}
        </TabsContent>

        <TabsContent value="action-needed">
          <ActionNeededTab />
        </TabsContent>

        <TabsContent value="order-issues">
          <OrderIssuesTab />
        </TabsContent>

        <TabsContent value="instapay">
          <InstapayTab />
        </TabsContent>

      </Tabs>

      <BottomNav value={activeTab} onChange={changeTab} tabs={visibleTabs} />
    </div>
  );
}

function LiveTab({ data }: { data: DashboardPayload }) {
  const { meta, shopify, truth, alerts, thresholds, rtoRate } = data;

  // Week-over-week CPP, the number that tells you whether to act today.
  const weeks = meta.trend.filter((w) => w.purchases > 0);
  const prevWeek = weeks.length >= 2 ? weeks[weeks.length - 2] : null;
  const cppDelta =
    prevWeek && prevWeek.cpp > 0 && meta.last7?.cpp
      ? (meta.last7.cpp - prevWeek.cpp) / prevWeek.cpp
      : null;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Real cost per order"
          help="Last 7 days. Meta's cost per purchase divided by (1 − failed-delivery rate), so it's what you pay per order that actually reaches a customer. Arrow: change vs the week before. Source: Meta Ads (cosmetics campaigns) + the failed-delivery rate."
          value={formatEgp(truth.last7.rtoAdjustedCpp)}
          delta={cppDelta}
          deltaGoodDirection="down"
          note={`Meta reports ${formatEgp(truth.last7.reportedCpp)}. This adds the ${(rtoRate * 100).toFixed(2)}% that never gets delivered.`}
          emphasis
        />
        <KpiCard
          label="True MER"
          help="Last 7 days. Shopify gross sales minus the expected failed deliveries, divided by Meta ad spend. How many pounds of delivered revenue each pound of ads brings. Source: Shopify orders + Meta Ads."
          value={`${truth.last7.trueMer.toFixed(2)}x`}
          note={`Meta reports ${truth.last7.reportedRoas.toFixed(2)}x platform ROAS. This is RTO-adjusted revenue over spend.`}
          emphasis
        />
        <KpiCard
          label="Ad spend"
          help="Last 7 days. Total spent on the cosmetics campaigns, the purchases Meta attributes to them, and frequency (average times each person saw an ad — above 3 means the creative is getting stale). Source: Meta Ads."
          value={formatEgp(meta.last7?.spend ?? 0)}
          note={`${meta.last7?.purchases ?? 0} purchases · frequency ${formatNumber(meta.last7?.frequency ?? 0, 2)}`}
        />
        <KpiCard
          label="Lost to failed delivery"
          help="Last 7 days. Shopify gross sales × the failed-delivery rate: sales you should expect not to collect. Compared with the cancellations and refunds Shopify has recorded so far, which lag weeks behind. Source: Shopify orders + RTO rate."
          value={formatEgp(truth.last7.expectedRtoLoss)}
          note={`Expected on ${formatEgp(truth.last7.grossSales)} gross. Shopify has only recorded ${formatEgp(shopify.last7.recordedReversals)} so far — reversals land weeks late.`}
        />
      </section>

      <AlertsPanel alerts={alerts} />

      <section className="grid gap-4 lg:grid-cols-2">
        <CppTrendChart trend={meta.trend} ceiling={thresholds.adCppCeiling} />
        <DailySalesChart window={shopify.last30} />
      </section>

      <CampaignTable
        campaigns={meta.campaigns7}
        thresholds={thresholds}
        rtoRate={rtoRate}
      />

      <AdTable ads={meta.ads7} thresholds={thresholds} rtoRate={rtoRate} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Orders, last 30d"
          help="Shopify orders placed in the last 30 days, excluding cancelled ones. AOV is gross sales divided by those orders. Source: Shopify orders (whole store)."
          value={formatNumber(shopify.last30.orders)}
          note={`AOV ${formatEgp(shopify.last30.aov)}`}
        />
        <KpiCard
          label="Gross sales, last 30d"
          help="Total value of all Shopify orders placed in the last 30 days, before cancellations and refunds. RTO-adjusted removes the expected failed deliveries. Source: Shopify orders + RTO rate."
          value={formatEgp(shopify.last30.grossSales)}
          note={`RTO-adjusted: ${formatEgp(truth.last30.rtoAdjustedRevenue)}`}
        />
        <KpiCard
          label="30-day true MER"
          help="Same as True MER, over 30 days: RTO-adjusted Shopify sales divided by Meta ad spend on the cosmetics campaigns. Smoother than the 7-day figure. Source: Shopify orders + Meta Ads."
          value={`${truth.last30.trueMer.toFixed(2)}x`}
          note={`On ${formatEgp(meta.last30?.spend ?? 0)} spend`}
        />
        <KpiCard
          label="Budget to exit learning"
          help="(Cost per purchase × 50) ÷ 7. The daily budget one ad set needs to get 50 purchases a week, which Meta requires to leave the learning phase. Source: Meta Ads cost per purchase."
          value={
            data.learningPhaseDailyBudget
              ? `${formatEgp(data.learningPhaseDailyBudget)}/day`
              : "—"
          }
          note="Per ad set, to clear 50 conversions a week. Below this, an ad set never leaves learning phase."
        />
      </section>
    </>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <Skeleton className="h-48" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  const needsSetup = error.error === "missing_credentials";

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>
          {needsSetup ? "Add your API credentials" : "Could not load ad data"}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm leading-relaxed break-words">
          {error.message}
        </p>

        {needsSetup && (
          <>
            <p className="text-sm">
              Create <code className="bg-muted rounded px-1.5 py-0.5">.env.local</code>{" "}
              in the project root, copy the keys from{" "}
              <code className="bg-muted rounded px-1.5 py-0.5">.env.example</code>,
              then restart the dev server. Setup steps are in{" "}
              <code className="bg-muted rounded px-1.5 py-0.5">README.md</code>.
            </p>
            <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
              {error.missing?.map((k) => `${k}=`).join("\n")}
            </pre>
          </>
        )}

        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
