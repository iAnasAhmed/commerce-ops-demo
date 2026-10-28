import Image from "next/image";
import Link from "next/link";

import { Bars, CppChart, DailyChart, Donut, Funnel } from "@/components/tour/charts";
import { CountUp, Reveal } from "@/components/tour/motion";
import { ValueAndOffer } from "@/components/tour/value-and-offer";
import { CALL_TYPES, FAQ, ISSUES, ROUTINE, TABS, type Severity } from "@/demo/pitch";
import { pageStats } from "@/demo/stats";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Commerce Ops — track ads, Shopify and Bosta in one place",
  description: "Meta Ads, Shopify and Bosta on one screen: real cost per delivered order, 15 order mistakes caught, and a call list for failed deliveries.",
};

const SEV: Array<{ key: Severity; color: string }> = [
  { key: "Critical", color: "var(--status-critical)" },
  { key: "Warning", color: "var(--chart-4)" },
  { key: "Slow", color: "var(--chart-1)" },
  { key: "Customer", color: "var(--chart-5)" },
  { key: "Info", color: "oklch(0.6 0 0)" },
];

function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-5 sm:p-6 ${className}`}>{children}</div>;
}

function Head({ kicker, title }: { kicker: string; title: string }) {
  return (
    <Reveal className="mb-6 sm:mb-8">
      <p className="text-xs font-semibold tracking-[0.18em] text-[var(--chart-1)] uppercase">{kicker}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h2>
    </Reveal>
  );
}

export default function Tour() {
  const s = pageStats();
  const t = s.totals;
  const sevCounts = SEV.map((x) => ({ label: x.key, value: ISSUES.filter((i) => i.severity === x.key).length }));
  const k = (n: number) => (n >= 1000 ? Math.round(n / 1000) : n);

  return (
    <div className="relative w-full overflow-x-clip">
      <header className="glass-bar sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="truncate text-sm font-semibold tracking-tight">
            Commerce Ops <span className="text-muted-foreground hidden font-normal sm:inline">· Velora demo</span>
          </span>
          <nav className="flex shrink-0 items-center gap-1 text-sm whitespace-nowrap sm:gap-2">
            <Link href="/app" className="rounded-full px-3 py-1.5 hover:bg-white/60">
              Live demo
            </Link>
            <a href="#offer" className="btn-glow rounded-full px-3.5 py-1.5 font-medium text-white">
              Make an offer
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-20 px-4 pb-20 sm:space-y-28 sm:px-6">
        {/* ------------------------------------------------ hero */}
        <section className="pt-12 sm:pt-20">
          <Reveal instant>
            <p className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
              <span className="pulse-dot" /> Meta Ads · Shopify · Bosta
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl leading-[0.98] font-semibold tracking-tight text-balance sm:text-7xl">
              Ads. Store. Courier.{" "}
              <span className="text-gradient">One screen.</span>
            </h1>
          </Reveal>

          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Sales, 30 days", node: <CountUp value={k(t.revenue)} prefix="EGP " suffix="k" /> },
              { label: "Orders", node: <CountUp value={t.orders} /> },
              { label: "Delivered", node: <CountUp value={t.deliveredRate * 100} suffix="%" decimals={1} /> },
              { label: "Lost to failed delivery", node: <CountUp value={k(t.failedValue)} prefix="EGP " suffix="k" />, red: true },
            ].map((x, i) => (
              <Reveal instant key={x.label} delay={i * 90}>
                <Glass className="h-full">
                  <p className="text-muted-foreground text-xs">{x.label}</p>
                  <p className={`mt-2 font-mono text-2xl font-semibold sm:text-4xl ${x.red ? "text-[var(--status-critical)]" : ""}`}>{x.node}</p>
                </Glass>
              </Reveal>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-5">
            <Reveal instant className="lg:col-span-2" delay={100}>
              <Glass className="h-full">
                <p className="mb-4 text-sm font-semibold">Same 30 days, three answers</p>
                <Funnel data={s.funnel} />
              </Glass>
            </Reveal>
            <Reveal instant className="lg:col-span-3" delay={200}>
              <Glass className="h-full">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Orders per day</p>
                  <p className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--chart-3)]" />Delivered</span>
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--status-critical)]" />Failed</span>
                  </p>
                </div>
                <DailyChart data={s.days} />
              </Glass>
            </Reveal>
          </div>

          <Reveal instant delay={150} className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className="btn-glow rounded-full px-6 py-3 text-sm font-semibold text-white">
              Open the live demo →
            </Link>
            <a href="#value" className="glass rounded-full px-6 py-3 text-sm font-semibold">
              What&apos;s it worth to you?
            </a>
          </Reveal>
        </section>

        {/* ------------------------------------------------ ad cost */}
        <section>
          <Head kicker="Ad cost" title="Meta's number vs the real one." />
          <div className="grid gap-3 lg:grid-cols-3">
            <Reveal>
              <Glass className="h-full space-y-5">
                <div>
                  <p className="text-muted-foreground text-xs">Meta cost per purchase</p>
                  <p className="font-mono text-4xl font-semibold text-[var(--chart-1)]"><CountUp value={Math.round(t.metaCpp)} prefix="EGP " /></p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Real cost per delivered order</p>
                  <p className="font-mono text-4xl font-semibold text-[var(--chart-2)]"><CountUp value={Math.round(t.realCpp)} prefix="EGP " /></p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Gap</p>
                  <p className="font-mono text-4xl font-semibold"><CountUp value={(t.realCpp / t.metaCpp - 1) * 100} prefix="+" suffix="%" decimals={0} /></p>
                </div>
              </Glass>
            </Reveal>
            <Reveal delay={120} className="lg:col-span-2">
              <Glass className="h-full">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Cost per purchase, weekly</p>
                  <p className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--chart-1)]" />Meta</span>
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--chart-2)]" />Real</span>
                  </p>
                </div>
                <CppChart data={s.weeks} />
              </Glass>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------ issues */}
        <section id="issues" className="scroll-mt-20">
          <Head kicker="Order issues" title="15 mistakes. Caught automatically." />
          <div className="grid gap-3 lg:grid-cols-5">
            <Reveal className="lg:col-span-2">
              <Glass className="h-full">
                <Donut data={sevCounts} center={ISSUES.length} centerLabel="checks" colors={SEV.map((x) => x.color)} />
              </Glass>
            </Reveal>
            <Reveal delay={120} className="lg:col-span-3">
              <Glass className="h-full">
                <ul className="flex flex-wrap gap-2">
                  {ISSUES.map((x, i) => (
                    <li
                      key={x.title}
                      className="chip-in flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-medium"
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <i className="size-2 shrink-0 rounded-full" style={{ background: SEV.find((s) => s.key === x.severity)?.color }} />
                      {x.title}
                    </li>
                  ))}
                </ul>
              </Glass>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------ deliveries */}
        <section>
          <Head kicker="Failed deliveries" title="Why parcels come back." />
          <div className="grid gap-3 md:grid-cols-3">
            <Reveal>
              <Glass className="h-full">
                <p className="mb-4 text-sm font-semibold">Reasons, 30 days</p>
                <Bars data={s.reasons} color="var(--status-critical)" />
              </Glass>
            </Reveal>
            <Reveal delay={100}>
              <Glass className="h-full">
                <p className="mb-4 text-sm font-semibold">How customers pay</p>
                <Donut data={s.payments} center={t.orders} centerLabel="orders" />
              </Glass>
            </Reveal>
            <Reveal delay={200}>
              <Glass className="h-full">
                <p className="mb-4 text-sm font-semibold">Top cities</p>
                <Bars data={s.cities} color="var(--chart-1)" />
              </Glass>
            </Reveal>
          </div>
          <Reveal delay={150} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CALL_TYPES.map((c) => (
              <div key={c.name} className="glass rounded-2xl px-4 py-3 text-sm font-medium">
                {c.name}
              </div>
            ))}
          </Reveal>
        </section>

        {/* ------------------------------------------------ tabs */}
        <section id="tour" className="scroll-mt-20">
          <Head kicker="Inside" title="9 tabs. One question each." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TABS.map((tab, i) => (
              <Reveal key={tab.id} delay={(i % 3) * 90}>
                <Link href={`/app#${tab.id}`} className="glass lift group block overflow-hidden rounded-3xl">
                  <div className="overflow-hidden border-b border-white/60">
                    <Image src={tab.shot} alt={`The ${tab.name} tab`} width={1440} height={900} className="h-auto w-full transition-transform duration-700 group-hover:scale-[1.04]" />
                  </div>
                  <div className="p-4">
                    <p className="flex items-center justify-between font-semibold">
                      {tab.name}
                      <span className="text-muted-foreground font-mono text-xs">{String(i + 1).padStart(2, "0")}</span>
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-sm">{tab.line}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ routine */}
        <section id="guide" className="scroll-mt-20">
          <Head kicker="Daily routine" title="About an hour a day." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {ROUTINE.map((r, i) => (
              <Reveal key={r.when} delay={i * 80}>
                <Glass className="h-full">
                  <p className="font-mono text-2xl font-semibold text-[var(--chart-1)]">{r.time.replace(" minutes", "m")}</p>
                  <p className="mt-1 font-semibold">{r.when}</p>
                  <p className="text-muted-foreground text-xs">{r.who}</p>
                  <p className="mt-3 text-sm">{r.steps[0]}</p>
                </Glass>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ value + offer */}
        <section>
          <Head kicker="Your brand" title="Your numbers. Your price." />
          <ValueAndOffer />
        </section>

        {/* ------------------------------------------------ faq */}
        <section>
          <Head kicker="Questions" title="Quick answers." />
          <div className="grid gap-3 md:grid-cols-2">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 80}>
                <Glass className="h-full">
                  <p className="font-semibold">{f.q}</p>
                  <p className="text-muted-foreground mt-1.5 text-sm">{f.a}</p>
                </Glass>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <footer className="glass-bar">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6">
          <span>Velora Cosmetics is a made-up brand. All data is generated.</span>
          <span className="flex gap-4">
            <Link href="/app" className="hover:text-foreground">Live demo</Link>
            <a href="#offer" className="hover:text-foreground">Make an offer</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
