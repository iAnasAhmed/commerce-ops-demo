"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { HelpTip } from "@/components/dashboard/help-tip";
import { cn } from "@/lib/utils";

/** A titled block with an ⓘ helper — the building unit of the newer tabs. */
export function Panel({
  title,
  help,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  help: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card min-w-0 rounded-xl p-4 ring-1 ring-foreground/10 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-base font-semibold">
            {title}
            <HelpTip label={title} text={help} />
          </h3>
          {subtitle && <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionError({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="break-words">{message}</span>
    </p>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-lg px-3 py-2.5">
      <p className="text-muted-foreground text-[11px] leading-tight font-medium tracking-wide uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums tracking-tight",
          tone === "good" && "text-[var(--status-good)]",
          tone === "bad" && "text-[var(--status-critical)]",
          tone === "warn" && "text-[var(--status-warning)]",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
    </div>
  );
}

/** Tables scroll sideways inside their own box, never the page. */
export function ScrollTable({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[480px] text-sm [&_td]:py-2 [&_td]:pr-3 [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase [&_tbody_tr]:border-t [&_tbody_tr]:border-border">
        {children}
      </table>
    </div>
  );
}

export const egp = (n: number) => `EGP ${Math.round(n).toLocaleString("en-US")}`;
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
export const shortDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Load a JSON endpoint once per page view and share it between tabs — a
 * reload in one tab updates every other tab reading the same URL.
 * `reload(true)` asks the server to skip its cache.
 */
type Listener = (state: { data?: unknown; error?: string; loading: boolean }) => void;
const cache = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<Listener>>();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? json.error ?? `Request failed (${res.status})`);
  return json;
}

function load(url: string, fresh: boolean) {
  const notify = (state: Parameters<Listener>[0]) => listeners.get(url)?.forEach((l) => l(state));
  const p = getJson(fresh ? `${url}${url.includes("?") ? "&" : "?"}refresh=1` : url);
  cache.set(url, p);
  notify({ loading: true });
  p.then(
    (data) => notify({ data, loading: false }),
    (e: unknown) => {
      cache.delete(url);
      notify({ error: e instanceof Error ? e.message : "Could not load", loading: false });
    },
  );
  return p;
}

export function useShared<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const listener: Listener = (state) => {
      setLoading(state.loading);
      if (state.loading) return;
      if (state.data !== undefined) {
        setData(state.data as T);
        setError(null);
      }
      if (state.error) setError(state.error);
    };
    const set = listeners.get(url) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(url, set);

    const existing = cache.get(url);
    if (existing) {
      existing.then(
        (d) => listener({ data: d, loading: false }),
        (e: unknown) => listener({ error: e instanceof Error ? e.message : "Could not load", loading: false }),
      );
    } else {
      void load(url, false).catch(() => {});
    }
    return () => {
      set.delete(listener);
    };
  }, [url]);

  async function reload(fresh = false) {
    await load(url, fresh).catch(() => {});
  }

  return { data, error, loading, reload, setData };
}
