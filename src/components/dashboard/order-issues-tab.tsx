"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, MessageCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { IssueOrder, IssueSeverity, OrderIssuesReport } from "@/lib/order-issues";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/dashboard/help-tip";

interface ApiResponse {
  generatedAt: string;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  staleReason: string | null;
  report: OrderIssuesReport;
  resolutions: Resolution[];
}

interface Resolution {
  orderRef: string;
  issueKey: string;
  note: string;
  resolvedAt: string;
}

interface ApiError {
  error: string;
  message: string;
  missing?: string[];
}

const BRAND = "Velora Cosmetics";
const RULE = "━━━━━━━━━━━━━━━";

const SECTIONS: Array<{
  severity: IssueSeverity;
  title: string;
  emoji: string;
  description: string;
}> = [
  {
    severity: "critical",
    title: "Fix today",
    emoji: "🔴",
    description: "Money at risk or the wrong waybill. Sort these out before the courier's next run.",
  },
  {
    severity: "warning",
    title: "Check",
    emoji: "🟡",
    description: "A payment or a pickup that needs confirming.",
  },
  {
    severity: "slow",
    title: "Slow deliveries",
    emoji: "🐢",
    description: "Placed more than 3 days ago and still not delivered, or flagged late by Bosta.",
  },
  {
    severity: "customer",
    title: "Cancelled or refused by the customer",
    emoji: "📞",
    description: "These are also in Action Needed, with call and WhatsApp buttons.",
  },
  {
    severity: "info",
    title: "For information",
    emoji: "ℹ️",
    description: "Orders that look odd but are probably fine — like two orders merged onto one waybill.",
  },
];

const PILL: Record<IssueSeverity, string> = {
  critical:
    "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15 dark:bg-red-500/10 dark:text-red-300",
  warning:
    "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  slow: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300",
  customer: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  info: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
};

const DOT: Record<IssueSeverity, string> = {
  critical: "bg-red-600",
  warning: "bg-amber-500",
  slow: "bg-sky-600",
  customer: "bg-muted-foreground",
  info: "bg-emerald-600",
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: "Fix today",
  warning: "Check",
  slow: "Slow",
  customer: "Customer",
  info: "Info",
};

/** The set of issues an order had when it was marked resolved. */
const issueKey = (order: IssueOrder) =>
  order.issues
    .map((issue) => issue.kind)
    .sort()
    .join(",");

const egp = (n: number) => `EGP ${Math.round(n).toLocaleString("en-US")}`;

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The operations message: every order that needs fixing or checking, with
 * the action for each. Customer cancellations are counted but left to the
 * call list, so the same order isn't chased from two messages.
 */
function buildMessage(orders: IssueOrder[]): string {
  const ops = orders.filter((o) => o.severity !== "customer" && o.severity !== "info");
  const customers = orders.filter((o) => o.severity === "customer").length;
  const date = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const lines = [
    `*${BRAND}*`,
    "*Order Issues — Action Required*",
    "",
    `📅 ${date}`,
    `📦 ${ops.length} order${ops.length === 1 ? "" : "s"} need${ops.length === 1 ? "s" : ""} attention`,
  ];

  let n = 0;
  for (const section of SECTIONS) {
    if (section.severity === "customer" || section.severity === "info") continue;
    const rows = ops.filter((o) => o.severity === section.severity);
    if (rows.length === 0) continue;

    lines.push("", RULE, `${section.emoji} *${section.title.toUpperCase()} (${rows.length})*`, RULE);
    for (const order of rows) {
      n += 1;
      const head = [
        `*${n}. Order ${order.orderRef}*`,
        order.total !== null ? egp(order.total) : null,
        order.payment !== "—" ? order.payment : null,
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push("", head);
      if (order.trackingNumber) {
        lines.push(`🚚 Bosta ${order.trackingNumber}${order.bostaStatus ? ` — ${order.bostaStatus}` : ""}`);
      }
      for (const issue of order.issues.filter((i) => i.severity !== "customer" && i.severity !== "info")) {
        lines.push(`⚠️ ${issue.title}`, `👉 ${issue.action}`);
      }
    }
  }

  lines.push("", RULE);
  if (customers > 0) {
    lines.push(`📞 ${customers} customer cancellation${customers === 1 ? "" : "s"} or refusal${customers === 1 ? "" : "s"} — in the call list.`);
  }
  lines.push("✅ *Reply with the order number once it's fixed.*");
  return lines.join("\n");
}

async function fetchIssues(refresh = false): Promise<{ data?: ApiResponse; error?: ApiError }> {
  try {
    const res = await fetch(`/api/order-issues${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
    const json = await res.json();
    return res.ok ? { data: json as ApiResponse } : { error: json as ApiError };
  } catch (e) {
    return {
      error: { error: "network", message: e instanceof Error ? e.message : "Request failed" },
    };
  }
}

const linkButton =
  "inline-flex h-10 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 sm:h-9";

export function OrderIssuesTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    const result = await fetchIssues(refresh);
    if (result.data) setData(result.data);
    if (result.error) setError(result.error);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchIssues();
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card space-y-3 rounded-xl p-5 ring-1 ring-foreground/10">
        <p className="font-semibold">
          {error.error === "missing_credentials" ? "Missing credentials" : "Could not check orders"}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed break-words">{error.message}</p>
        <Button onClick={() => void load(true)} variant="outline" size="sm">
          <RefreshCw />
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { report } = data;
  const resolutionOf = (order: IssueOrder) =>
    data.resolutions?.find((r) => r.orderRef === order.orderRef && r.issueKey === issueKey(order));
  const open = report.orders.filter((o) => !resolutionOf(o));
  const resolved = report.orders.filter((o) => resolutionOf(o));
  const count = (severity: IssueSeverity) => open.filter((o) => o.severity === severity).length;

  async function setResolved(order: IssueOrder, isResolved: boolean, note = "") {
    const res = await fetch("/api/order-issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderRef: order.orderRef, issueKey: issueKey(order), note, resolved: isResolved }),
    });
    if (!res.ok) throw new Error("save failed");
    setData((prev) => {
      if (!prev) return prev;
      const rest = (prev.resolutions ?? []).filter((r) => r.orderRef !== order.orderRef);
      return {
        ...prev,
        resolutions: isResolved
          ? [...rest, { orderRef: order.orderRef, issueKey: issueKey(order), note, resolvedAt: new Date().toISOString() }]
          : rest,
      };
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            Order issues
            <HelpTip label="Order issues" text="Recent orders checked automatically against Bosta for problems: wrong COD, missing or duplicate waybills, slow or failed deliveries. Mark an issue resolved once handled." />
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">
            Orders placed in the last {report.windowDays} days · Shopify + Bosta · checked{" "}
            {formatWhen(data.fetchedAt)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={loading}
          aria-label="Check again"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Check again</span>
        </Button>
      </div>

      {data.stale && (
        <p className={cn("rounded-lg px-3 py-2 text-sm leading-relaxed", PILL.warning)}>
          Shopify or Bosta didn&apos;t respond just now, so this is the last good check from{" "}
          {formatWhen(data.fetchedAt)}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fix today" value={count("critical")} tone="critical" help="Orders with money at risk or the wrong waybill, e.g. Bosta's COD amount doesn't match Shopify. Fix before the courier's next run. Source: Shopify + Bosta." />
        <Stat label="Check" value={count("warning")} tone="warning" help="A payment or pickup that needs confirming, e.g. an order Bosta hasn't picked up yet. Source: Shopify + Bosta." />
        <Stat label="Slow deliveries" value={count("slow")} tone="slow" help="Placed more than 3 days ago and still not delivered, or flagged late by Bosta. Source: Bosta." />
        <Stat label="Customer problems" value={count("customer")} tone="customer" help="Orders the customer cancelled or refused. They also appear in Action Needed to call. Source: Bosta." />
      </div>

      <p className="text-muted-foreground text-xs sm:text-sm">
        <strong className="text-foreground">
          {report.cleanOrders} of {report.ordersChecked}
        </strong>{" "}
        orders placed in the last {report.windowDays} days have no issues.
      </p>

      <ShareCard orders={open} />

      {open.length === 0 ? (
        <div className="bg-card rounded-xl p-6 text-center ring-1 ring-foreground/10">
          <p className="font-semibold">No issues</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Every order from the last {report.windowDays} days matches between Shopify and Bosta.
          </p>
        </div>
      ) : (
        SECTIONS.map((section) => {
          const rows = open.filter((o) => o.severity === section.severity);
          if (rows.length === 0) return null;
          return (
            <section key={section.severity} className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">
                  {section.title}{" "}
                  <span className="text-muted-foreground font-normal tabular-nums">· {rows.length}</span>
                </h3>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed sm:text-sm">
                  {section.description}
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((order) => (
                  <IssueCard
                    key={order.orderRef}
                    order={order}
                    onResolve={(note) => setResolved(order, true, note)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {resolved.length > 0 && (
        <details className="group space-y-3">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-base font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            Resolved{" "}
            <span className="text-muted-foreground font-normal tabular-nums">· {resolved.length}</span>
          </summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {resolved.map((order) => (
              <IssueCard
                key={order.orderRef}
                order={order}
                resolution={resolutionOf(order)}
                onReopen={() => setResolved(order, false)}
              />
            ))}
          </div>
        </details>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        Checks: cancelled orders with an open waybill · items on no waybill or orders never sent
        to Bosta · COD that doesn&apos;t match Shopify (card or Apple Pay taken by Bosta at the
        door counts as paid) · Instapay not confirmed · prepaid orders coming back · not picked up
        after 24 hours · not delivered after 3 days · failed attempts and cancellations.
      </p>
    </div>
  );
}

function Stat({ label, value, tone, help }: { label: string; value: number; tone: IssueSeverity; help: string }) {
  return (
    <div className="bg-card rounded-xl px-3 py-3 ring-1 ring-foreground/10 sm:px-4">
      <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] leading-tight font-medium tracking-wide uppercase">
        <span className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
        {label}
        <HelpTip label={label} text={help} />
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function ShareCard({ orders }: { orders: IssueOrder[] }) {
  const [copied, setCopied] = useState(false);
  const ops = orders.filter((o) => o.severity !== "customer" && o.severity !== "info");
  const message = buildMessage(orders);
  const empty = ops.length === 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="bg-card rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <MessageCircle className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Send to the operations team</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed sm:text-sm">
            {empty
              ? "Nothing to fix or check right now."
              : `WhatsApp opens with the ${ops.length} order${ops.length === 1 ? "" : "s"} to fix or check, and what to do for each.`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex">
        {empty ? (
          <span className={cn(linkButton, "bg-muted text-muted-foreground")}>
            <MessageCircle />
            Nothing to send
          </span>
        ) : (
          <a
            className={cn(linkButton, "bg-emerald-700 text-white hover:bg-emerald-800")}
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle />
            Send to WhatsApp
          </a>
        )}
        <button
          type="button"
          className={cn(linkButton, "border border-border bg-background hover:bg-muted")}
          onClick={() => void copy()}
          disabled={empty}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy message"}
        </button>
      </div>

      {!empty && (
        <details className="group mt-3">
          <summary className="text-muted-foreground flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            Preview message
          </summary>
          <pre className="bg-muted/50 mt-2 max-h-96 overflow-auto rounded-lg p-3 font-sans text-xs leading-relaxed break-words whitespace-pre-wrap">
            {message}
          </pre>
        </details>
      )}
    </div>
  );
}

function IssueCard({
  order,
  resolution,
  onResolve,
  onReopen,
}: {
  order: IssueOrder;
  resolution?: Resolution;
  onResolve?: (note: string) => Promise<void>;
  onReopen?: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setFailed(false);
    try {
      await action();
      setEditing(false);
    } catch {
      setFailed(true);
    }
    setSaving(false);
  }

  const meta = [
    order.total !== null ? egp(order.total) : null,
    order.payment !== "—" ? order.payment : null,
    order.paid ? "Paid" : null,
    order.placedAt ? `Placed ${formatWhen(order.placedAt)}` : null,
  ].filter(Boolean);

  return (
    <article className="bg-card flex min-w-0 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 max-w-full">
          <p className="font-semibold tabular-nums">{order.orderRef}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">{meta.join(" · ")}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
            PILL[order.severity],
          )}
        >
          {SEVERITY_LABEL[order.severity]}
          {order.issues.length > 1 ? ` · ${order.issues.length} issues` : ""}
        </span>
      </div>

      <ul className="space-y-2">
        {order.issues.map((issue, i) => (
          <li key={`${issue.kind}-${i}`} className="bg-muted/50 rounded-lg px-3 py-2.5">
            <p className="flex items-start gap-2 text-sm leading-snug font-medium">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[issue.severity])} aria-hidden />
              {issue.title}
            </p>
            <p className="text-muted-foreground mt-1 pl-3.5 text-xs leading-relaxed">{issue.detail}</p>
            <p className="mt-1.5 pl-3.5 text-xs leading-relaxed font-medium">→ {issue.action}</p>
          </li>
        ))}
      </ul>

      {(order.trackingNumber || order.cancelledInShopify) && (
        <p className="text-muted-foreground text-[11px] tabular-nums">
          {order.trackingNumber ? `Bosta ${order.trackingNumber}` : "No Bosta waybill"}
          {order.bostaStatus ? ` · ${order.bostaStatus}` : ""}
          {order.cancelledInShopify ? " · cancelled in Shopify" : ""}
        </p>
      )}

      {resolution && (
        <p className={cn("rounded-lg px-3 py-2 text-xs leading-relaxed", PILL.info)}>
          Resolved {formatWhen(resolution.resolvedAt.includes("T") ? resolution.resolvedAt : `${resolution.resolvedAt.replace(" ", "T")}Z`)}
          {resolution.note ? ` — ${resolution.note}` : ""}
        </p>
      )}

      {editing && (
        <textarea
          className="border-border bg-background min-h-16 w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="What was done (optional)"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {onResolve && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Check />
            Mark resolved
          </Button>
        )}
        {onResolve && editing && (
          <>
            <Button size="sm" disabled={saving} onClick={() => void run(() => onResolve(note.trim()))}>
              <Check />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        )}
        {onReopen && (
          <Button variant="outline" size="sm" disabled={saving} onClick={() => void run(onReopen)}>
            Reopen
          </Button>
        )}
        {failed && <span className="text-xs text-red-600">Couldn&apos;t save — try again.</span>}
      </div>
    </article>
  );
}
