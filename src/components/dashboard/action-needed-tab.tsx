"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, MessageCircle, Phone, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActionLogEntry } from "@/lib/action-log";
import type { ActionItem, ParcelWhereabouts, ReasonCategory } from "@/lib/bosta";
import { formatEgp } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/dashboard/help-tip";

interface ActionRow extends ActionItem {
  log: ActionLogEntry | null;
}

interface ApiResponse {
  generatedAt: string;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  staleReason: string | null;
  items: ActionRow[];
}

interface ApiError {
  error: string;
  message: string;
  missing?: string[];
}

const BRAND = "Velora Cosmetics";

/** Tinted pills. Text is a dark step of each hue so it stays readable on white. */
const TONE = {
  critical:
    "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15 dark:bg-red-500/10 dark:text-red-300",
  warning:
    "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
} as const;

const REASON_LABEL: Record<ReasonCategory, string> = {
  whatsapp_cancelled: "Cancelled on WhatsApp",
  bosta_cancelled: "Cancelled by Bosta",
  refused: "Refused",
  no_answer: "Couldn't reach",
  postponed: "Postponed",
  other_failed_attempt: "Needs action",
};

const REASON_TONE: Record<ReasonCategory, keyof typeof TONE> = {
  whatsapp_cancelled: "critical",
  bosta_cancelled: "warning",
  refused: "critical",
  no_answer: "warning",
  postponed: "neutral",
  other_failed_attempt: "neutral",
};

const WHEREABOUTS_LABEL: Record<ParcelWhereabouts, string> = {
  with_bosta: "With Bosta",
  back_with_us: "Returned to us",
  closed_by_bosta: "Closed by Bosta",
};

const CANCELLED: ReasonCategory[] = ["whatsapp_cancelled", "bosta_cancelled"];

/**
 * Still a live delivery: a Send parcel Bosta holds that nobody has cancelled.
 * The courier will try again, which makes it the easiest order to save.
 */
function isOutForDelivery(row: ActionItem): boolean {
  return (
    row.type === "Send" &&
    row.whereabouts === "with_bosta" &&
    !CANCELLED.includes(row.reasonCategory)
  );
}

/** Ordered by how savable the order is. Every row lands in exactly one section. */
const SECTIONS: Array<{
  title: string;
  emoji: string;
  description: string;
  messageNote?: string;
  match: (row: ActionItem) => boolean;
}> = [
  {
    title: "Still out for delivery — attempt failed",
    emoji: "🚚",
    description:
      "Bosta still has these and the courier will try again. Call before the next attempt so it gets delivered.",
    messageNote: "_The courier will try again — please call before the next attempt._",
    match: isOutForDelivery,
  },
  {
    title: "Cancelled on WhatsApp",
    emoji: "❌",
    description:
      "The customer declined Bosta's WhatsApp confirmation before any delivery attempt.",
    match: (row) => row.reasonCategory === "whatsapp_cancelled",
  },
  {
    title: "Failed attempt — coming back to us",
    emoji: "↩️",
    description:
      "The courier tried, it didn't go through, and the parcel is returning or already back. Offer to re-ship.",
    match: (row) => !isOutForDelivery(row) && !CANCELLED.includes(row.reasonCategory),
  },
  {
    title: "Cancelled by Bosta",
    emoji: "🏢",
    description:
      "A Bosta hub or Bosta's automation cancelled it before any attempt. Check with the customer, and with Bosta.",
    match: (row) => row.reasonCategory === "bosta_cancelled",
  },
];

/** Bosta's courier codes, rewritten the way support would say them on a call. */
const REASON_TEXT: Array<[RegExp, string]> = [
  [/refuses to receive/i, "Refused to receive the order"],
  [/opened by force/i, "Opened the parcel, then refused it"],
  [/wants to open/i, "Wanted to open the parcel before paying"],
  [/product issue/i, "Refused over an issue with the product"],
  [/not in the address/i, "Wasn't at the address"],
  [/changed the address/i, "Changed the delivery address"],
  [/phone is off/i, "Phone was switched off"],
  [/not answering|no answer/i, "Didn't answer the courier"],
  [/wrong phone/i, "Wrong phone number on the order"],
  [/postpon/i, "Asked to postpone the delivery"],
];

function reasonText(row: ActionItem): string {
  if (row.reasonCategory === "whatsapp_cancelled") {
    return "Declined Bosta's WhatsApp confirmation";
  }
  for (const [pattern, text] of REASON_TEXT) {
    if (pattern.test(row.lastReason)) return text;
  }
  return row.lastReason.replace(/\.$/, "");
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timingText(row: ActionItem): string {
  if (row.attempts === 0) return `Cancelled ${formatWhen(row.lastEventAt)}`;
  const plural = row.attempts === 1 ? "attempt" : "attempts";
  return row.attempts === 1
    ? `1 ${plural} · ${formatWhen(row.lastEventAt)}`
    : `${row.attempts} ${plural} · first ${formatWhen(row.firstFailedAt)} · last ${formatWhen(row.lastEventAt)}`;
}

const RULE = "━━━━━━━━━━━━━━━";

/** One order, as it reads in WhatsApp — shared by the full list and the per-order copy. */
function orderLines(row: ActionRow, prefix = ""): string[] {
  const lines = [
    `*${prefix}Order ${row.orderRef || row.trackingNumber}*`,
    `👤 ${row.customerName || "No name on Bosta"}${row.city ? ` — ${row.city}` : ""}`,
    `📞 ${row.phone || "No phone on Bosta"}`,
  ];
  if (row.reasonCategory !== "whatsapp_cancelled") {
    lines.push(`📝 ${reasonText(row)}`);
  }
  lines.push(
    `🕒 ${timingText(row)}`,
    `📍 ${WHEREABOUTS_LABEL[row.whereabouts]}${row.codAmount > 0 ? ` · COD ${formatEgp(row.codAmount)}` : ""}`,
  );
  return lines;
}

function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className ?? outlineLink}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * The call list as one WhatsApp message for the support group. WhatsApp
 * renders *bold* and _italic_; phone numbers stay in +20… form with no spaces
 * so they're tappable. Only orders not yet marked Contacted are included.
 */
function buildWhatsAppMessage(rows: ActionRow[]): string {
  const date = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const lines = [
    `*${BRAND}*`,
    `*Customer Follow-up List*`,
    "",
    `📅 ${date}`,
    `📦 ${rows.length} order${rows.length === 1 ? "" : "s"} to call`,
  ];

  let n = 0;
  for (const section of SECTIONS) {
    const sectionRows = rows.filter((row) => section.match(row));
    if (sectionRows.length === 0) continue;

    lines.push("", RULE, `${section.emoji} *${section.title.toUpperCase()} (${sectionRows.length})*`, RULE);
    if (section.messageNote) lines.push(section.messageNote);

    for (const row of sectionRows) {
      n += 1;
      lines.push("", ...orderLines(row, `${n}. `));
    }
  }

  const example = rows[0]?.orderRef || "#VL000000";
  lines.push(
    "",
    RULE,
    "✅ *After each call, please reply with:*",
    "Order number — outcome — customer's answer",
    `_Example: ${example} — Confirmed — deliver on Thursday_`,
  );

  return lines.join("\n");
}

async function fetchActionNeeded(
  refresh = false,
): Promise<{ data?: ApiResponse; error?: ApiError }> {
  try {
    const res = await fetch(`/api/action-needed${refresh ? "?refresh=1" : ""}`, {
      cache: "no-store",
    });
    const json = await res.json();
    return res.ok ? { data: json as ApiResponse } : { error: json as ApiError };
  } catch (e) {
    return {
      error: {
        error: "network",
        message: e instanceof Error ? e.message : "Request failed",
      },
    };
  }
}

/** Anchor styled as a button — used where the action is a link (tel:, wa.me). */
const linkButton =
  "inline-flex h-10 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 sm:h-9";
const outlineLink = cn(linkButton, "border border-border bg-background hover:bg-muted");

export function ActionNeededTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  /** Manual refresh skips the five-minute cache; saving a row does not. */
  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    const result = await fetchActionNeeded(refresh);
    if (result.data) setData(result.data);
    if (result.error) setError(result.error);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await fetchActionNeeded();
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
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    const needsSetup = error.error === "missing_credentials";
    return (
      <div className="bg-card space-y-3 rounded-xl ring-1 ring-foreground/10 p-5">
        <p className="font-semibold">{needsSetup ? "Add BOSTA_API_KEY" : "Could not load the call list"}</p>
        <p className="text-muted-foreground text-sm leading-relaxed break-words">{error.message}</p>
        <Button onClick={() => void load(true)} variant="outline" size="sm">
          <RefreshCw />
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const isContacted = (row: ActionRow) => (row.log?.contacted ?? "No") === "Yes";
  const open = data.items.filter((row) => !isContacted(row));
  const contacted = data.items.filter(isContacted);
  const inSection = (row: ActionRow, i: number) => SECTIONS[i].match(row);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            Orders to call
            <HelpTip label="Orders to call" text="Orders from the last 7 days that failed delivery or were cancelled, grouped by what happened, with call and WhatsApp buttons. Tick contacted once done." />
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">
            Last 7 days · Bosta data from {formatWhen(data.fetchedAt)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={loading}
          aria-label="Refresh from Bosta"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {data.stale && (
        <p className={cn("rounded-lg px-3 py-2 text-sm leading-relaxed", TONE.warning)}>
          Bosta didn&apos;t respond just now, so this is the last good pull from{" "}
          {formatWhen(data.fetchedAt)}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="To call" value={open.length} help="All orders from the last 7 days that failed or were cancelled and aren't marked contacted yet. Source: Bosta + Shopify." emphasis />
        <Stat label="Still out for delivery" help="A delivery attempt failed but Bosta still has the parcel and will try again. Call before the next attempt. Source: Bosta." value={open.filter((r) => inSection(r, 0)).length} />
        <Stat label="Cancelled on WhatsApp" help="The customer declined Bosta's WhatsApp confirmation before any delivery attempt. Source: Bosta." value={open.filter((r) => inSection(r, 1)).length} />
        <Stat label="Returned to us" help="The delivery failed and the parcel is already back with you. Offer the customer a re-ship. Source: Bosta." value={open.filter((r) => r.whereabouts === "back_with_us").length} />
      </div>

      <WhatsAppShare rows={open} />

      {open.length === 0 ? (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-6 text-center">
          <p className="font-semibold">All caught up</p>
          <p className="text-muted-foreground mt-1 text-sm">No orders need a call right now.</p>
        </div>
      ) : (
        SECTIONS.map((section, i) => {
          const rows = open.filter((row) => inSection(row, i));
          if (rows.length === 0) return null;
          return (
            <section key={section.title} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">
                    {section.title}{" "}
                    <span className="text-muted-foreground font-normal tabular-nums">· {rows.length}</span>
                  </h3>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed sm:text-sm">
                    {section.description}
                  </p>
                </div>
                <CopyButton
                  text={buildWhatsAppMessage(rows)}
                  label="Copy section"
                  className={cn(outlineLink, "shrink-0")}
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((row) => (
                  <OrderCard key={row.trackingNumber} row={row} onSaved={load} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {contacted.length > 0 && (
        <details className="group bg-card rounded-xl ring-1 ring-foreground/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>
              Already contacted{" "}
              <span className="text-muted-foreground font-normal tabular-nums">· {contacted.length}</span>
            </span>
            <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t p-3 lg:grid-cols-2">
            {contacted.map((row) => (
              <OrderCard key={row.trackingNumber} row={row} onSaved={load} />
            ))}
          </div>
        </details>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        Orders that were delivered in the end are left out. Returned orders stay
        on the list so they can be re-shipped. Who was called, and what they
        said, is saved in this dashboard — never in Bosta.
      </p>
    </div>
  );
}

function Stat({ label, value, help, emphasis = false }: { label: string; value: number; help: string; emphasis?: boolean }) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl ring-1 ring-foreground/10 px-3 py-3 sm:px-4",
        emphasis && "bg-muted/50 ring-foreground/20",
      )}
    >
      <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] leading-tight font-medium tracking-wide uppercase">
        {label}
        <HelpTip label={label} text={help} />
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

/**
 * Meta's official WhatsApp API cannot post into groups, and unofficial
 * automation risks the business number being banned — so this hands the
 * message to WhatsApp itself, and a person picks the support group.
 */
function WhatsAppShare({ rows }: { rows: ActionRow[] }) {
  const [copied, setCopied] = useState(false);
  const message = buildWhatsAppMessage(rows);
  const empty = rows.length === 0;

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
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <MessageCircle className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Send the list to support</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed sm:text-sm">
            WhatsApp opens with {empty ? "the list" : `all ${rows.length} orders`} written
            out. Choose the support group and send. Mark each order Contacted once
            they reply.
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
          className={outlineLink}
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

function OrderCard({ row, onSaved }: { row: ActionRow; onSaved: () => void }) {
  const [contacted, setContacted] = useState(row.log?.contacted ?? "No");
  const [notes, setNotes] = useState(row.log?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save(next: { contacted?: typeof contacted; notes?: string }) {
    const nextContacted = next.contacted ?? contacted;
    const nextNotes = next.notes ?? notes;
    if (nextContacted === (row.log?.contacted ?? "No") && nextNotes === (row.log?.notes ?? "")) {
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/action-needed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: row.trackingNumber,
          orderRef: row.orderRef,
          contacted: nextContacted,
          reason: row.lastReason,
          notes: nextNotes,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const digits = row.phone.replace(/\D/g, "");
  const fieldClass =
    "border-input bg-background h-10 rounded-lg border px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:h-9 sm:text-sm";

  return (
    <article className="bg-card flex min-w-0 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      {/* Wraps the reason pill under the name on a narrow phone instead of clipping it. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 max-w-full">
          <p className="font-semibold tabular-nums">{row.orderRef || row.trackingNumber}</p>
          <p className="mt-0.5 truncate text-sm">{row.customerName || "No name on Bosta"}</p>
          <p className="text-muted-foreground text-xs">
            {row.city || "No city"} · {WHEREABOUTS_LABEL[row.whereabouts]}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
            TONE[REASON_TONE[row.reasonCategory]],
          )}
        >
          {REASON_LABEL[row.reasonCategory]}
        </span>
      </div>

      <div className="bg-muted/50 rounded-lg px-3 py-2">
        <p className="text-sm leading-snug">{reasonText(row)}</p>
        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          {timingText(row)}
          {row.codAmount > 0 ? ` · COD ${formatEgp(row.codAmount)}` : ""}
        </p>
        {isOutForDelivery(row) && (
          <p className="mt-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            Courier will try again — call before the next attempt
          </p>
        )}
      </div>

      {digits ? (
        <div className="grid grid-cols-3 gap-2">
          <a className={outlineLink} href={`tel:${row.phone}`}>
            <Phone />
            Call
          </a>
          <a
            className={outlineLink}
            href={`https://wa.me/${digits}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle />
            WhatsApp
          </a>
          <CopyButton text={orderLines(row).join("\n")} label="Copy" />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">No phone number on Bosta.</p>
          <CopyButton text={orderLines(row).join("\n")} label="Copy" />
        </div>
      )}

      <div className="grid grid-cols-[7.5rem_1fr] gap-2">
        <select
          aria-label="Contacted?"
          className={fieldClass}
          value={contacted}
          disabled={saving}
          onChange={(e) => {
            const value = e.target.value as typeof contacted;
            setContacted(value);
            void save({ contacted: value });
          }}
        >
          <option value="No">Not called</option>
          <option value="Yes">Contacted</option>
          <option value="No answer">No answer</option>
        </select>
        <input
          aria-label="Notes"
          className={cn(fieldClass, "min-w-0")}
          value={notes}
          disabled={saving}
          placeholder="Add a note…"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void save({ notes })}
        />
      </div>

      <p className="text-muted-foreground text-[11px] tabular-nums">
        Bosta {row.trackingNumber}
        {row.phone ? ` · ${row.phone}` : ""}
      </p>
    </article>
  );
}
