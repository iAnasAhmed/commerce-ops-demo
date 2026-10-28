"use client";

import { useMemo, useState } from "react";

const egp = (n: number) => `EGP ${Math.round(n).toLocaleString("en-US")}`;

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
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
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

const NEEDS = [
  "Meta Ads",
  "Shopify",
  "Bosta",
  "Another courier",
  "Call team list",
  "Order mistake checks",
  "Arabic version",
  "TikTok or Snapchat ads",
] as const;

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function ValueAndOffer() {
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
      if (!res.ok) throw new Error(body.message ?? "Something went wrong. Please try again.");
      setStatus({ kind: "sent" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------------------------------------------------- calculator */}
      <section id="value" className="scroll-mt-20 bg-card rounded-2xl border p-5 sm:p-7">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Step 1</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">What failed deliveries cost you now</h3>
        <p className="text-muted-foreground mt-2 text-sm">Move the sliders to match your brand. Nothing is sent anywhere.</p>

        <div className="mt-6 space-y-5">
          <Field label="Orders per day" value={orders} onChange={setOrders} min={5} max={300} />
          <Field label="Average order value" value={aov} onChange={setAov} min={200} max={5000} step={50} suffix=" EGP" />
          <Field label="Orders that fail to deliver" value={failRate} onChange={setFailRate} min={2} max={35} suffix="%" hint="Refused, unreachable or cancelled at the door. 10–15% is common for cash on delivery in Egypt." />
          <Field label="Failed orders saved by a call" value={rescue} onChange={setRescue} min={0} max={50} suffix="%" hint="Your guess. A same-day call to a customer who cancelled or didn't answer often saves the order." />
          <Field label="Courier fee for a returned parcel" value={returnFee} onChange={setReturnFee} min={0} max={200} step={5} suffix=" EGP" />
          <Field label="Hours a day on sheets and checks" value={hours} onChange={setHours} min={0} max={8} step={0.5} hint="Time spent matching Shopify, Bosta and Meta by hand. Valued at EGP 120 an hour." />
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-3 text-sm">
          <div className="bg-muted/60 rounded-xl p-3">
            <dt className="text-muted-foreground text-xs">Failed orders a month</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{Math.round(v.failed).toLocaleString("en-US")}</dd>
          </div>
          <div className="bg-muted/60 rounded-xl p-3">
            <dt className="text-muted-foreground text-xs">Sales lost to them</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">{egp(v.lostSales)}</dd>
          </div>
          <div className="bg-muted/60 rounded-xl p-3">
            <dt className="text-muted-foreground text-xs">Sales saved by calling</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{egp(v.rescuedSales)}</dd>
          </div>
          <div className="bg-muted/60 rounded-xl p-3">
            <dt className="text-muted-foreground text-xs">Fees and time saved</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{egp(v.feesAvoided + v.timeValue)}</dd>
          </div>
        </dl>
        <div className="bg-foreground text-background mt-3 rounded-xl p-4">
          <p className="text-xs opacity-75">Estimated value to you, every month</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{egp(v.total)}</p>
          <p className="mt-1 text-xs opacity-75">{egp(v.total * 12)} a year. An estimate from your own numbers, not a promise.</p>
        </div>
      </section>

      {/* ---------------------------------------------------- offer */}
      <section id="offer" className="scroll-mt-20 bg-card rounded-2xl border p-5 sm:p-7">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Step 2</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">What would this be worth to you?</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          You know your business best. Tell me what you would pay to have this built and connected to your own store, ads and courier.
         
        </p>

        {status.kind === "sent" ? (
          <div className="mt-6 rounded-xl border border-emerald-600/30 bg-emerald-50 p-5 dark:bg-emerald-950/40" role="status">
            <p className="font-semibold">Thank you. Your offer was received.</p>
            <p className="text-muted-foreground mt-1 text-sm">I&apos;ll reply by email with what I can build for that budget.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                <span>Your name</span>
                <input name="name" required maxLength={80} autoComplete="name" className="bg-background w-full rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Email</span>
                <input name="email" type="email" required maxLength={120} autoComplete="email" className="bg-background w-full rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm" />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Brand or store (optional)</span>
              <input name="brand" maxLength={80} autoComplete="organization" className="bg-background w-full rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm" />
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <label className="space-y-1.5 text-sm font-medium">
                <span>Your offer</span>
                <input name="amount" type="number" required min={1} max={100000000} inputMode="numeric" placeholder="Amount" className="bg-background w-full rounded-lg border px-3 py-2.5 font-mono text-base font-normal sm:text-sm" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Currency</span>
                <select name="currency" defaultValue="EGP" className="bg-background rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm">
                  <option>EGP</option>
                  <option>USD</option>
                  <option>SAR</option>
                  <option>AED</option>
                </select>
              </label>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">How you would like to pay</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["one_time", "One payment", "Built and handed over"],
                  ["monthly", "Monthly", "Hosted, updated, supported"],
                  ["setup_monthly", "Setup + monthly", "Lower start, ongoing care"],
                ].map(([value, title, sub], i) => (
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
              <legend className="text-sm font-medium">What you need</legend>
              <div className="flex flex-wrap gap-2">
                {NEEDS.map((n) => {
                  const on = needs.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setNeeds((cur) => (on ? cur.filter((x) => x !== n) : [...cur, n]))}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "bg-foreground text-background border-foreground" : "hover:bg-muted"}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="block space-y-1.5 text-sm font-medium">
              <span>Anything else? (optional)</span>
              <textarea name="message" rows={3} maxLength={1500} className="bg-background w-full rounded-lg border px-3 py-2.5 text-base font-normal sm:text-sm" placeholder="Your courier, your monthly orders, or what bothers you most today." />
            </label>
            {/* Left empty by people; bots fill it. */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

            <p className="text-muted-foreground text-xs">
              Your estimate above ({egp(v.total)} a month) is sent with the offer so I can see the size of the problem. Your details are used only to reply to you.
            </p>

            {status.kind === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {status.message}
              </p>
            )}
            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="bg-foreground text-background w-full rounded-lg px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status.kind === "sending" ? "Sending…" : "Send my offer"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
