"use client";

import { useState } from "react";
import { Check, ExternalLink, MessageCircle, RefreshCw, RotateCcw } from "lucide-react";

import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel, SectionError, egp, shortDay, useShared } from "@/components/dashboard/panel";
import { GrowthLoading } from "@/components/dashboard/test-tab";
import { Button } from "@/components/ui/button";
import type { AbandonedCheckout, CustomersReport, Followup, ReorderCustomer } from "@/lib/customers";
import { cn } from "@/lib/utils";

type Response = CustomersReport & { followups: Followup[]; fetchedAt: string; stale: boolean };
type Status = Followup["status"];

const STATUS_LABEL: Record<Status, string> = {
  messaged: "Messaged",
  ordered: "Ordered again",
  skip: "Skipped",
};

async function saveFollowup(key: string, status: Status | "clear") {
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, status }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(json.message ?? json.error ?? "Couldn't save");
  }
}

const firstName = (name: string) => name.split(" ")[0] || name;

function reorderMessage(c: ReorderCustomer) {
  const item = c.lastItems[0] ? ` your ${c.lastItems[0]}` : "";
  return `Hi ${firstName(c.name)} 💕 It's Velora. Hope you're loving${item}! Just checking in — if you're running low or want to try a new shade, reply here and we'll help you pick.`;
}

function abandonedMessage(c: AbandonedCheckout) {
  const item = c.items[0] ? ` the ${c.items[0]}` : " your items";
  const link = c.recoveryUrl ? `\n\nYou can finish your order here: ${c.recoveryUrl}` : "";
  return `Hi ${firstName(c.name)} 💕 It's Velora. We noticed you left${item} in your cart — can we help with anything, like picking a shade or delivery?${link}`;
}

export function CustomersTab() {
  const { data, error, loading, reload, setData } = useShared<Response>("/api/customers");
  const [view, setView] = useState<"abandoned" | "reorder">("abandoned");
  const [showDone, setShowDone] = useState(false);

  const statusOf = (key: string) => data?.followups.find((f) => f.key === key)?.status;

  async function mark(key: string, status: Status | "clear") {
    await saveFollowup(key, status);
    setData((d) =>
      d && {
        ...d,
        followups:
          status === "clear"
            ? d.followups.filter((f) => f.key !== key)
            : [...d.followups.filter((f) => f.key !== key), { key, status, note: "", updatedAt: new Date().toISOString() }],
      },
    );
  }

  const abandoned = data?.abandoned.ok ? data.abandoned.data : [];
  const reorder = data?.reorder.ok ? data.reorder.data : [];
  const openAbandoned = abandoned.filter((c) => !statusOf(c.key));
  const openReorder = reorder.filter((c) => !statusOf(c.key));
  const ordered = data?.followups.filter((f) => f.status === "ordered").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            Customers
            <HelpTip
              label="Customers"
              text="People worth a WhatsApp message: shoppers who left a checkout in the last 3 days, and past buyers due for a reorder (last order 30–120 days ago). Selling to them costs no ad money. Tap WhatsApp, then mark what happened."
            />
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">
            {data ? `${ordered} came back after a message · Shopify, updated ${new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Shopify"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload(true)} disabled={loading} aria-label="Reload">
          <RefreshCw className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Reload</span>
        </Button>
      </div>

      {!data && loading && <GrowthLoading />}
      {!data && error && <SectionError message={error} />}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-muted inline-flex rounded-lg p-1" role="tablist" aria-label="Customer list">
              {(
                [
                  ["abandoned", `Left checkout · ${openAbandoned.length}`],
                  ["reorder", `Due to reorder · ${openReorder.length}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium tabular-nums",
                    view === id ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="text-muted-foreground ml-auto flex items-center gap-2 text-xs">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              Show people already handled
            </label>
          </div>

          {view === "abandoned" ? (
            <Panel
              title="Left checkout"
              help="Shopify checkouts from the last 3 days that were started but not finished. The message includes Shopify's link that reopens their cart. Newest first."
            >
              {!data.abandoned.ok ? (
                <SectionError message={data.abandoned.error} />
              ) : (
                <List
                  items={(showDone ? abandoned : openAbandoned).map((c) => ({
                    key: c.key,
                    name: c.name,
                    phone: c.phone,
                    title: `${egp(c.total)} · ${c.items.join(", ") || "items"}`,
                    meta: `${new Date(c.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${c.province ? ` · ${c.province}` : ""}`,
                    message: abandonedMessage(c),
                    link: c.recoveryUrl,
                  }))}
                  statusOf={statusOf}
                  onMark={mark}
                  empty="No open abandoned checkouts."
                />
              )}
            </Panel>
          ) : (
            <Panel
              title="Due to reorder"
              help="Customers whose last order was 30–120 days ago and who haven't ordered since. Repeat buyers and bigger spenders are listed first — they're the most likely to come back."
            >
              {!data.reorder.ok ? (
                <SectionError message={data.reorder.error} />
              ) : (
                <List
                  items={(showDone ? reorder : openReorder).slice(0, 60).map((c) => ({
                    key: c.key,
                    name: c.name,
                    phone: c.phone,
                    title: `${c.orders} order${c.orders === 1 ? "" : "s"} · ${egp(c.totalSpent)} total`,
                    meta: `Last ${c.lastOrderRef} on ${shortDay(c.lastOrderDay)} (${c.daysSince} days ago)${c.lastItems.length ? ` · ${c.lastItems.slice(0, 2).join(", ")}` : ""}`,
                    message: reorderMessage(c),
                    link: null,
                  }))}
                  statusOf={statusOf}
                  onMark={mark}
                  empty="Nobody is due right now."
                />
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

interface Item {
  key: string;
  name: string;
  phone: string | null;
  title: string;
  meta: string;
  message: string;
  link: string | null;
}

function List({
  items,
  statusOf,
  onMark,
  empty,
}: {
  items: Item[];
  statusOf: (key: string) => Status | undefined;
  onMark: (key: string, status: Status | "clear") => Promise<void>;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-muted-foreground py-4 text-center text-sm">{empty}</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <Row key={item.key} item={item} status={statusOf(item.key)} onMark={onMark} />
      ))}
    </div>
  );
}

function Row({
  item,
  status,
  onMark,
}: {
  item: Item;
  status: Status | undefined;
  onMark: (key: string, status: Status | "clear") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function run(next: Status | "clear") {
    setBusy(true);
    setFailed(null);
    try {
      await onMark(item.key, next);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn't save");
    }
    setBusy(false);
  }

  return (
    <article className={cn("bg-muted/30 flex min-w-0 flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/5", status && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.name}</p>
          <p className="text-sm">{item.title}</p>
          <p className="text-muted-foreground text-xs">{item.meta}</p>
        </div>
        {status && (
          <span className="bg-muted shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">{STATUS_LABEL[status]}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {item.phone ? (
          <a
            href={`https://wa.me/${item.phone}?text=${encodeURIComponent(item.message)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => !status && void run("messaged")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-medium text-white"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">No phone number</span>
        )}
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Cart
          </a>
        )}
        {status ? (
          <>
            {status !== "ordered" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("ordered")}>
                <Check />
                Ordered
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run("clear")}>
              <RotateCcw />
              Undo
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("messaged")}>
              <Check />
              Messaged
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run("skip")}>
              Skip
            </Button>
          </>
        )}
      </div>
      {failed && <p className="text-xs text-red-600">{failed}</p>}
    </article>
  );
}
