"use client";

import { useMemo, useState } from "react";

import { DICT, type Lang } from "@/demo/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function Field({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  const id = `f-${label.length}-${min}-${max}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums">
          {value.toLocaleString("en-US")}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-foreground h-2 w-full cursor-pointer"
      />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

// Needs are always sent in English so the offer email reads the same.
const NEEDS = DICT.en.offer.needs;

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function ValueAndOffer({ lang = "en" }: { lang?: Lang }) {
  const t = DICT[lang].offer;
  const ar = lang === "ar";
  const egp = (n: number) => (ar ? `${fmt(n)} ج.م` : `EGP ${fmt(n)}`);
  const [orders, setOrders] = useState(17);
  const [aov, setAov] = useState(1350);
  const [failRate, setFailRate] = useState(12);
  const [rescue, setRescue] = useState(20);
  const [returnFee, setReturnFee] = useState(85);
  const [hours, setHours] = useState(2);

  const v = useMemo(() => {
    const monthly = orders * 30;
    const failed = (monthly * failRate) / 100;
    const lostSales = failed * aov;
    const rescued = (failed * rescue) / 100;
    const rescuedSales = rescued * aov;
    const feesAvoided = rescued * returnFee;
    // Time saved: hours a day on spreadsheets, 26 working days, at a modest hourly cost.
    const timeValue = hours * 26 * 120;
    const total = rescuedSales + feesAvoided + timeValue;
    return { monthly, failed, lostSales, rescued, rescuedSales, feesAvoided, timeValue, total };
  }, [orders, aov, failRate, rescue, returnFee, hours]);

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [needs, setNeeds] = useState<string[]>(["Meta Ads", "Shopify", "Bosta"]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/offer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email"),
          brand: f.get("brand"),
          amount: Number(f.get("amount")),
          currency: f.get("currency"),
          pricing: f.get("pricing"),
          message: f.get("message"),
          website: f.get("website"),
          ordersPerDay: orders,
          estimate: Math.round(v.total),
          needs,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(ar ? t.err : (body.message ?? t.err));
      setStatus({ kind: "sent" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : t.err });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------------------------------------------------- calculator */}
      <section id="value" className="glass scroll-mt-20 rounded-3xl p-5 sm:p-7">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{t.step1}</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{t.calcTitle}</h3>
        

        <div className="mt-6 space-y-5">
          <Field label={t.fields[0]} value={orders} onChange={setOrders} min={5} max={300} />
          <Field label={t.fields[1]} value={aov} onChange={setAov} min={200} max={5000} step={50} suffix={t.egpSuffix} />
          <Field label={t.fields[2]} value={failRate} onChange={setFailRate} min={2} max={35} suffix="%" />
          <Field label={t.fields[3]} value={rescue} onChange={setRescue} min={0} max={50} suffix="%" />
          <Field label={t.fields[4]} value={returnFee} onChange={setReturnFee} min={0} max={200} step={5} suffix={t.egpSuffix} />
          <Field label={t.fields[5]} value={hours} onChange={setHours} min={0} max={8} step={0.5} />
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-white/70 bg-white/50 p-3">
            <dt className="text-muted-foreground text-xs">{t.out[0]}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{Math.round(v.failed).toLocaleString("en-US")}</dd>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/50 p-3">
            <dt className="text-muted-foreground text-xs">{t.out[1]}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">{egp(v.lostSales)}</dd>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/50 p-3">
            <dt className="text-muted-foreground text-xs">{t.out[2]}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{egp(v.rescuedSales)}</dd>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/50 p-3">
            <dt className="text-muted-foreground text-xs">{t.out[3]}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{egp(v.feesAvoided + v.timeValue)}</dd>
          </div>
        </dl>
        <div className="btn-glow mt-3 rounded-2xl p-4 text-white">
          <p className="text-xs opacity-75">{t.monthly}</p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums">{egp(v.total)}</p>
          <p className="mt-1 text-xs opacity-75">{t.yearly(egp(v.total * 12))}</p>
        </div>
      </section>

      {/* ---------------------------------------------------- offer */}
      <section id="offer" className="glass scroll-mt-20 rounded-3xl p-5 sm:p-7">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{t.step2}</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{t.offerTitle}</h3>

        {status.kind === "sent" ? (
          <div className="mt-6 rounded-xl border border-emerald-600/30 bg-emerald-50 p-5 dark:bg-emerald-950/40" role="status">
            <p className="font-semibold">{t.thanks}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t.thanksSub}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                <span>{t.name}</span>
                <input name="name" required maxLength={80} autoComplete="name" className="bg-background w-full rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>{t.email}</span>
                <input name="email" type="email" required maxLength={120} autoComplete="email" className="bg-background w-full rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm" />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>{t.brand}</span>
              <input name="brand" maxLength={80} autoComplete="organization" className="bg-background w-full rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm" />
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <label className="space-y-1.5 text-sm font-medium">
                <span>{t.yourOffer}</span>
                <input name="amount" type="number" required min={1} max={100000000} inputMode="numeric" placeholder={t.amount} className="bg-background w-full rounded-lg border px-3 py-2.5 font-mono text-base font-normal sm:text-sm" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>{t.currency}</span>
                <select name="currency" defaultValue="EGP" className="bg-background rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm">
                  <option>EGP</option>
                  <option>USD</option>
                  <option>SAR</option>
                  <option>AED</option>
                </select>
              </label>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.payHow}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["one_time", "monthly", "setup_monthly"] as const).map((value, i) => [value, ...t.plans[i]]).map(([value, title, sub], i) => (
                  <label key={value} className="has-[:checked]:border-foreground has-[:checked]:bg-muted/60 flex cursor-pointer flex-col rounded-lg border p-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <input type="radio" name="pricing" value={value} defaultChecked={i === 2} className="accent-foreground" />
                      {title}
                    </span>
                    <span className="text-muted-foreground mt-0.5 text-xs">{sub}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.need}</legend>
              <div className="flex flex-wrap gap-2">
                {NEEDS.map((n, i) => {
                  const on = needs.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setNeeds((cur) => (on ? cur.filter((x) => x !== n) : [...cur, n]))}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "bg-foreground text-background border-foreground" : "hover:bg-muted"}`}
                    >
                      {t.needs[i]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="block space-y-1.5 text-sm font-medium">
              <span>{t.more}</span>
              <textarea name="message" rows={3} maxLength={1500} className="bg-background w-full rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm" placeholder={t.morePh} />
            </label>
            {/* Left empty by people; bots fill it. */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

            <p className="text-muted-foreground text-xs">
              {t.note(egp(v.total))}
            </p>

            {status.kind === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {status.message}
              </p>
            )}
            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="btn-glow w-full rounded-full px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {status.kind === "sending" ? t.sending : t.send}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
