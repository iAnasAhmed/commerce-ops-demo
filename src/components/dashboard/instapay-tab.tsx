"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { InstapayCheck, InstapayOrder } from "@/lib/instapay";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/dashboard/help-tip";
import { AnimatedValue } from "@/components/dashboard/animated-value";

interface ApiResponse {
  fetchedAt: string;
  windowDays: number;
  orders: InstapayOrder[];
  checks: InstapayCheck[];
}

type Group = "check" | "mark_paid" | "paid" | "cancelled";

const GROUPS: Array<{ id: Group; title: string; description: string; help: string; dot: string }> = [
  {
    id: "check",
    title: "Screenshot not checked",
    description: "Check the customer's Instapay transfer, then tick it.",
    help: "Instapay orders where nobody has confirmed the customer's transfer screenshot yet. Source: Shopify (payment method) + your ticks.",
    dot: "bg-red-600",
  },
  {
    id: "mark_paid",
    title: "Screenshot checked — mark paid",
    description: "The transfer is confirmed but Shopify still says pending. Mark it paid in Shopify, then reload.",
    help: "You ticked the screenshot as checked, but the order is still unpaid in Shopify. Mark it paid in Shopify yourself. Source: Shopify + your ticks.",
    dot: "bg-amber-500",
  },
  { id: "paid", title: "Paid in Shopify", description: "Nothing to do.", help: "Instapay orders already marked paid in Shopify. Nothing to do.", dot: "bg-emerald-600" },
  { id: "cancelled", title: "Cancelled", description: "Cancelled in Shopify.", help: "Instapay orders that were cancelled in Shopify.", dot: "bg-muted-foreground" },
];

const egp = (n: number) => `EGP ${Math.round(n).toLocaleString("en-US")}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/instapay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? json.error ?? "Couldn't save");
}

async function fetchInstapay(): Promise<{ data?: ApiResponse; error?: string }> {
  try {
    const res = await fetch("/api/instapay", { cache: "no-store" });
    const json = (await res.json()) as ApiResponse & { error?: string; message?: string };
    return res.ok ? { data: json } : { error: json.message ?? json.error ?? "Could not load" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Request failed" };
  }
}

export function InstapayTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await fetchInstapay();
    if (result.data) setData(result.data);
    if (result.error) setError(result.error);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchInstapay();
      if (cancelled) return;
      if (result.data) setData(result.data);
      if (result.error) setError(result.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-card space-y-3 rounded-xl p-5 ring-1 ring-foreground/10">
        <p className="font-semibold">Could not load Instapay orders</p>
        <p className="text-muted-foreground text-sm break-words">{error}</p>
        <Button onClick={() => void load()} variant="outline" size="sm">
          <RefreshCw />
          Try again
        </Button>
      </div>
    );
  }
  if (!data) return null;

  const checkOf = (ref: string) => data.checks.find((c) => c.orderRef === ref);
  const groupOf = (o: InstapayOrder): Group =>
    o.cancelled ? "cancelled" : o.paid ? "paid" : checkOf(o.orderRef)?.screenshot === "Yes" ? "mark_paid" : "check";

  function updateLocal(patch: (d: ApiResponse) => ApiResponse) {
    setData((prev) => (prev ? patch(prev) : prev));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            Instapay orders
            <HelpTip label="Instapay orders" text="Shopify orders from the last 7 days paid by Instapay, with their Bosta shipment details. Tick each one once you've seen the customer's transfer screenshot." />
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">
            Placed in the last {data.windowDays} days · Shopify + Bosta · loaded {when(data.fetchedAt)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Reload">
          <RefreshCw className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Reload</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {GROUPS.map((g) => (
          <div key={g.id} className="bg-card rounded-xl px-3 py-3 ring-1 ring-foreground/10 sm:px-4">
            <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] leading-tight font-medium tracking-wide uppercase">
              <span className={cn("size-1.5 shrink-0 rounded-full", g.dot)} aria-hidden />
              {g.title}
              <HelpTip label={g.title} text={g.help} />
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              <AnimatedValue value={data.orders.filter((o) => groupOf(o) === g.id).length} />
            </p>
          </div>
        ))}
      </div>

      {data.orders.length === 0 && (
        <p className="bg-card rounded-xl p-6 text-center text-sm ring-1 ring-foreground/10">
          No Instapay orders in the last {data.windowDays} days.
        </p>
      )}

      {GROUPS.map((g) => {
        const rows = data.orders.filter((o) => groupOf(o) === g.id);
        if (rows.length === 0) return null;
        const body = (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {rows.map((order) => (
              <InstapayCard
                key={order.orderRef}
                order={order}
                check={checkOf(order.orderRef)}
                onScreenshot={async (screenshot, note) => {
                  await post({ action: "screenshot", orderRef: order.orderRef, screenshot, note });
                  updateLocal((d) => ({
                    ...d,
                    checks: [
                      ...d.checks.filter((c) => c.orderRef !== order.orderRef),
                      { orderRef: order.orderRef, screenshot, note, updatedAt: new Date().toISOString() },
                    ],
                  }));
                }}
              />
            ))}
          </div>
        );
        const heading = (
          <>
            {g.title} <span className="text-muted-foreground font-normal tabular-nums">· {rows.length}</span>
          </>
        );
        return g.id === "paid" || g.id === "cancelled" ? (
          <details key={g.id}>
            <summary className="cursor-pointer text-base font-semibold">{heading}</summary>
            {body}
          </details>
        ) : (
          <section key={g.id}>
            <h3 className="text-base font-semibold">{heading}</h3>
            <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">{g.description}</p>
            {body}
          </section>
        );
      })}
    </div>
  );
}

function InstapayCard({
  order,
  check,
  onScreenshot,
}: {
  order: InstapayOrder;
  check?: InstapayCheck;
  onScreenshot: (screenshot: "Yes" | "No", note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(check?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const checked = check?.screenshot === "Yes";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailed(null);
    try {
      await action();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn't save");
    }
    setBusy(false);
  }

  const codWarning =
    !order.cancelled && order.bostaCod !== null && order.bostaCod > 0 && (order.paid || checked)
      ? `Bosta will still collect ${egp(order.bostaCod)} — set the COD to 0 on the waybill.`
      : null;

  return (
    <article className="bg-card flex min-w-0 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold tabular-nums">{order.orderRef}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {[egp(order.total), `Placed ${when(order.placedAt)}`, order.customerName || null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
          Shopify: {order.financialStatus.toLowerCase().replace(/_/g, " ")}
        </span>
      </div>

      <p className="text-muted-foreground text-xs tabular-nums">
        {order.trackingNumber
          ? `Bosta ${order.trackingNumber} · ${order.bostaStatus ?? ""} · COD ${egp(order.bostaCod ?? 0)}`
          : "No Bosta waybill yet"}
        {order.phone ? ` · ${order.phone}` : ""}
      </p>

      {codWarning && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {codWarning}
        </p>
      )}

      {!order.cancelled && (
        <>
          {!order.paid && (
            <input
              className="border-border bg-background h-9 w-full rounded-lg border px-3 text-sm"
              placeholder="Note (optional) — e.g. amount, time of transfer"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!order.paid && (
              <Button
                size="sm"
                variant={checked ? "outline" : "default"}
                disabled={busy}
                onClick={() => void run(() => onScreenshot(checked ? "No" : "Yes", note.trim()))}
              >
                <Check />
                {checked ? "Screenshot checked — undo" : "Screenshot checked"}
              </Button>
            )}
            {failed && <span className="text-xs text-red-600">{failed}</span>}
          </div>
        </>
      )}
    </article>
  );
}
