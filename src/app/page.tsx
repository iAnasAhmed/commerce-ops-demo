import Image from "next/image";
import Link from "next/link";

import { ValueAndOffer } from "@/components/tour/value-and-offer";
import { CALL_TYPES, FAQ, ISSUES, ROUTINE, RULES, SOURCES, TABS, type Severity } from "@/demo/pitch";
import { cairoDay, parcelOf, world } from "@/demo/world";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Commerce Ops — track ads, Shopify and Bosta in one place",
  description:
    "One dashboard for Meta Ads, Shopify and Bosta: real cost per delivered order, every order mistake caught, and a call list for failed deliveries.",
};

const DAY = 24 * 3600_000;

/** A full week from the demo world, old enough that every parcel has arrived. */
function lastWeek() {
  const now = Date.now();
  const w = world(now);
  const days = new Set(Array.from({ length: 7 }, (_, i) => cairoDay(now - (i + 8) * DAY)));
  let metaPurchases = 0;
  for (const d of days) for (const ad of w.adDays.get(d)?.values() ?? []) metaPurchases += ad.purchases;
  const orders = w.orders.filter((o) => days.has(cairoDay(o.createdAt)) && !(o.cancelledAt && o.cancelledAt <= now));
  const delivered = orders.filter((o) => parcelOf(o, now)?.state.code === 45).length;
  return { metaPurchases: Math.round(metaPurchases), orders: orders.length, delivered };
}

const SEVERITY: Record<Severity, string> = {
  Critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  Warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  Slow: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  Customer: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300",
  Info: "bg-muted text-muted-foreground",
};

function Section({ id, eyebrow, title, intro, children }: { id?: string; eyebrow: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 py-14 sm:py-20">
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{eyebrow}</p>
      <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {intro && <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed text-pretty sm:text-lg">{intro}</p>}
      <div className="mt-8 sm:mt-10">{children}</div>
    </section>
  );
}

export default function Tour() {
  const wk = lastWeek();

  return (
    <div className="w-full">
      <header className="bg-background/85 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="truncate text-sm font-semibold tracking-tight">
            Commerce Ops <span className="text-muted-foreground hidden font-normal sm:inline">· Velora demo</span>
          </span>
          <nav className="flex shrink-0 items-center gap-1 text-sm whitespace-nowrap sm:gap-2">
            <Link href="/app" className="hover:bg-muted rounded-lg px-2.5 py-1.5 sm:px-3">
              Live demo
            </Link>
            <a href="#offer" className="bg-foreground text-background rounded-lg px-2.5 py-1.5 font-medium sm:px-3">
              Make an offer
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ------------------------------------------------------------ hero */}
        <section className="pt-12 pb-10 sm:pt-20 sm:pb-14">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">For Shopify brands that sell with cash on delivery</p>
          <h1 className="mt-3 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            Your ads, your store and your courier. One screen that tells the truth.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-relaxed text-pretty">
            Meta, Shopify and Bosta each tell a different story about the same week. This dashboard puts them side by side, finds every order that went wrong, and tells your team who to call.
          </p>

          <div className="mt-8 grid max-w-3xl grid-cols-3 gap-2 sm:gap-3">
            {[
              ["Meta says", wk.metaPurchases, "purchases"],
              ["Shopify says", wk.orders, "orders"],
              ["Bosta delivered", wk.delivered, "orders"],
            ].map(([label, n, unit], i) => (
              <div key={String(label)} className={`rounded-2xl border p-3 sm:p-5 ${i === 2 ? "bg-foreground text-background" : "bg-card"}`}>
                <p className={`text-xs sm:text-sm ${i === 2 ? "opacity-75" : "text-muted-foreground"}`}>{label}</p>
                <p className="mt-1 font-mono text-3xl font-semibold tabular-nums sm:text-5xl">{n}</p>
                <p className={`text-xs ${i === 2 ? "opacity-75" : "text-muted-foreground"}`}>{unit}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-3 text-xs">One week of Velora's orders in this demo, after every parcel arrived or came back. Only the last number pays the bills.</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className="bg-foreground text-background rounded-xl px-5 py-3 text-sm font-semibold">
              Open the live demo →
            </Link>
            <a href="#value" className="hover:bg-muted rounded-xl border px-5 py-3 text-sm font-semibold">
              See what it&apos;s worth to you
            </a>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border shadow-sm">
            <Image src="/tour/live.png" alt="The Live tab: real cost per purchase, alerts and campaign table" width={1440} height={900} priority className="h-auto w-full" />
          </div>
        </section>

        {/* ------------------------------------------------------------ sources */}
        <Section eyebrow="What it connects" title="Three sources. One set of numbers you can trust." intro="It reads from the tools you already use. It never changes anything in them.">
          <div className="grid gap-3 md:grid-cols-3">
            {SOURCES.map((s) => (
              <div key={s.name} className="bg-card rounded-2xl border p-5">
                <h3 className="text-lg font-semibold">{s.name}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{s.reads}</p>
                <p className="mt-3 text-sm font-medium">{s.why}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------ tabs */}
        <Section id="tour" eyebrow="Inside the dashboard" title="Nine tabs. Each one answers one question." intro="Every screenshot below is from the live demo with Velora's made-up data.">
          <div className="space-y-16 sm:space-y-24">
            {TABS.map((t, i) => (
              <article key={t.id} className="grid items-center gap-6 lg:grid-cols-5 lg:gap-10">
                <div className={`lg:col-span-2 ${i % 2 ? "lg:order-2" : ""}`}>
                  <p className="text-muted-foreground font-mono text-xs">{String(i + 1).padStart(2, "0")} / {String(TABS.length).padStart(2, "0")}</p>
                  <h3 className="mt-1 text-2xl font-semibold tracking-tight">{t.name}</h3>
                  <p className="mt-2 text-lg text-pretty">{t.line}</p>
                  <ul className="text-muted-foreground mt-4 space-y-2 text-sm leading-relaxed">
                    {t.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span aria-hidden className="text-foreground">✓</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/app#${t.id}`} className="mt-5 inline-block text-sm font-semibold underline underline-offset-4">
                    Open {t.name} in the demo →
                  </Link>
                </div>
                <div className={`overflow-hidden rounded-2xl border shadow-sm lg:col-span-3 ${i % 2 ? "lg:order-1" : ""}`}>
                  <Image src={t.shot} alt={`The ${t.name} tab`} width={1440} height={900} className="h-auto w-full" />
                </div>
              </article>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------ issues */}
        <Section
          id="issues"
          eyebrow="Order issues it catches"
          title={`${ISSUES.length} ways an order goes wrong between Shopify and Bosta. All caught automatically.`}
          intro="Every recent order is checked against its waybill. Each problem comes with what is wrong and exactly how to fix it."
        >
          <div className="overflow-hidden rounded-2xl border">
            <div className="text-muted-foreground bg-muted/50 hidden grid-cols-12 gap-4 px-5 py-3 text-xs font-semibold tracking-wider uppercase md:grid">
              <span className="col-span-5">Problem</span>
              <span className="col-span-4">Example</span>
              <span className="col-span-3">What it saves you</span>
            </div>
            <ul className="divide-y">
              {ISSUES.map((x) => (
                <li key={x.title} className="grid gap-2 px-5 py-4 md:grid-cols-12 md:gap-4">
                  <div className="md:col-span-5">
                    <span className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY[x.severity]}`}>{x.severity}</span>
                    <p className="font-medium">{x.title}</p>
                  </div>
                  <p className="text-muted-foreground text-sm md:col-span-4">{x.example}</p>
                  <p className="text-sm md:col-span-3">{x.saves}</p>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* ------------------------------------------------------------ calls */}
        <Section eyebrow="Failed deliveries" title="A call list your team can finish before the next attempt." intro="Each failed or cancelled delivery is sorted by what to do about it, with the phone number, cash amount and the courier's reason in one row.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CALL_TYPES.map((c) => (
              <div key={c.name} className="bg-card rounded-2xl border p-5">
                <h3 className="font-semibold">{c.name}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{c.what}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------ guide */}
        <Section id="guide" eyebrow="How to use it" title="A daily routine that takes about an hour." intro="The dashboard does the checking. Your team does the fixing, in this order.">
          <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {ROUTINE.map((r) => (
              <li key={r.when} className="bg-card rounded-2xl border p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{r.when}</h3>
                  <span className="text-muted-foreground font-mono text-xs">{r.time}</span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">{r.who}</p>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                  {r.steps.map((s) => (
                    <li key={s} className="flex gap-2">
                      <span aria-hidden className="text-muted-foreground">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div className="bg-muted/50 mt-6 rounded-2xl p-5 sm:p-6">
            <h3 className="font-semibold">Five rules</h3>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
        </Section>

        {/* ------------------------------------------------------------ value + offer */}
        <Section eyebrow="Your brand" title="Work out what it's worth, then name your price." intro="Every brand is different, so there is no fixed price. Start from what failed deliveries cost you today.">
          <ValueAndOffer />
        </Section>

        {/* ------------------------------------------------------------ faq */}
        <Section eyebrow="Questions" title="Before you ask">
          <dl className="divide-y rounded-2xl border">
            {FAQ.map((f) => (
              <div key={f.q} className="p-5">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6">
          <span>Commerce Ops demo · Velora Cosmetics is a made-up brand.</span>
          <span className="flex gap-4">
            <Link href="/app" className="hover:text-foreground">Live demo</Link>
            <a href="#offer" className="hover:text-foreground">Make an offer</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
