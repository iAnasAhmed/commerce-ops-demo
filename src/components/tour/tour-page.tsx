import Image from "next/image";
import Link from "next/link";

import { Bars, CppChart, DailyChart, Donut, Funnel } from "@/components/tour/charts";
import { CountUp, Reveal } from "@/components/tour/motion";
import { ValueAndOffer } from "@/components/tour/value-and-offer";
import { DICT, tl, type Lang } from "@/demo/i18n";
import { ISSUES, TABS, type Severity } from "@/demo/pitch";
import { pageStats } from "@/demo/stats";

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

export function TourPage({ lang }: { lang: Lang }) {
  const d = DICT[lang];
  const s = pageStats();
  const t = s.totals;
  const sevCounts = SEV.map((x) => ({ label: d.sev[x.key], value: ISSUES.filter((i) => i.severity === x.key).length }));
  const k = (n: number) => (n >= 1000 ? Math.round(n / 1000) : n);

  return (
    <div dir={d.dir} lang={lang} className={`relative w-full overflow-x-clip ${lang === "ar" ? "font-arabic" : ""}`}>
      <header className="glass-bar sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="truncate text-sm font-semibold tracking-tight">
            {d.brand} <span className="text-muted-foreground hidden font-normal sm:inline">{d.brandSub}</span>
          </span>
          <nav className="flex shrink-0 items-center gap-1 text-sm whitespace-nowrap sm:gap-2">
            <Link href={d.switchHref} lang={lang === "ar" ? "en" : "ar"} className="rounded-full px-3 py-1.5 font-medium hover:bg-white/60">
              {d.switchLabel}
            </Link>
            <Link href="/app" className="hidden rounded-full px-3 py-1.5 hover:bg-white/60 sm:inline">
              {d.liveDemo}
            </Link>
            <a href="#offer" className="btn-glow rounded-full px-3.5 py-1.5 font-medium text-white">
              {d.makeOffer}
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-20 px-4 pb-20 sm:space-y-28 sm:px-6">
        {/* ------------------------------------------------ hero */}
        <section className="pt-12 sm:pt-20">
          <Reveal instant>
            <p className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
              <span className="pulse-dot" /> {d.pill}
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl leading-[0.98] font-semibold tracking-tight text-balance sm:text-7xl">
              {d.heroTitle}{" "}
              <span className="text-gradient">{d.heroAccent}</span>
            </h1>
          </Reveal>

          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: d.kpi[0], node: <CountUp value={k(t.revenue)} prefix={d.egp} suffix={d.k} /> },
              { label: d.kpi[1], node: <CountUp value={t.orders} /> },
              { label: d.kpi[2], node: <CountUp value={t.deliveredRate * 100} suffix="%" decimals={1} /> },
              { label: d.kpi[3], node: <CountUp value={k(t.failedValue)} prefix={d.egp} suffix={d.k} />, red: true },
            ].map((x, i) => (
              <Reveal instant key={x.label} delay={i * 90}>
                <Glass className="h-full">
                  <p className="text-muted-foreground text-xs">{x.label}</p>
                  <p className={`mt-2 font-mono text-2xl font-semibold whitespace-nowrap sm:text-4xl ${x.red ? "text-[var(--status-critical)]" : ""}`}>{x.node}</p>
                </Glass>
              </Reveal>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-5">
            <Reveal instant className="lg:col-span-2" delay={100}>
              <Glass className="h-full">
                <p className="mb-4 text-sm font-semibold">{d.funnelTitle}</p>
                <Funnel data={s.funnel.map((x) => ({ ...x, label: tl(d, x.label) }))} />
              </Glass>
            </Reveal>
            <Reveal instant className="lg:col-span-3" delay={200}>
              <Glass className="h-full">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">{d.perDay}</p>
                  <p className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--chart-3)]" />{d.delivered}</span>
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--status-critical)]" />{d.failed}</span>
                  </p>
                </div>
                <DailyChart data={s.days} names={[d.delivered, d.failed]} />
              </Glass>
            </Reveal>
          </div>

          <Reveal instant delay={150} className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className="btn-glow rounded-full px-6 py-3 text-sm font-semibold text-white">
              {d.openDemo}
            </Link>
            <a href="#value" className="glass rounded-full px-6 py-3 text-sm font-semibold">
              {d.worth}
            </a>
          </Reveal>
        </section>

        {/* ------------------------------------------------ ad cost */}
        <section>
          <Head kicker={d.adKicker} title={d.adTitle} />
          <div className="grid gap-3 lg:grid-cols-3">
            <Reveal>
              <Glass className="h-full space-y-5">
                <div>
                  <p className="text-muted-foreground text-xs">{d.metaCpp}</p>
                  <p className="font-mono text-4xl font-semibold text-[var(--chart-1)]"><CountUp value={Math.round(t.metaCpp)} prefix={d.egp} /></p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{d.realCpp}</p>
                  <p className="font-mono text-4xl font-semibold text-[var(--chart-2)]"><CountUp value={Math.round(t.realCpp)} prefix={d.egp} /></p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{d.gap}</p>
                  <p className="font-mono text-4xl font-semibold"><CountUp value={(t.realCpp / t.metaCpp - 1) * 100} prefix="+" suffix="%" decimals={0} /></p>
                </div>
              </Glass>
            </Reveal>
            <Reveal delay={120} className="lg:col-span-2">
              <Glass className="h-full">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">{d.weekly}</p>
                  <p className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--chart-1)]" />{d.meta}</span>
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--chart-2)]" />{d.real}</span>
                  </p>
                </div>
                <CppChart data={s.weeks} names={[d.meta, d.real]} />
              </Glass>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------ issues */}
        <section id="issues" className="scroll-mt-20">
          <Head kicker={d.issuesKicker} title={d.issuesTitle} />
          <div className="grid gap-3 lg:grid-cols-5">
            <Reveal className="lg:col-span-2">
              <Glass className="h-full">
                <Donut data={sevCounts} center={ISSUES.length} centerLabel={d.checks} colors={SEV.map((x) => x.color)} />
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
                      {d.issues[i]}
                    </li>
                  ))}
                </ul>
              </Glass>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------ deliveries */}
        <section>
          <Head kicker={d.failKicker} title={d.failTitle} />
          <div className="grid gap-3 md:grid-cols-3">
            <Reveal>
              <Glass className="h-full">
                <p className="mb-4 text-sm font-semibold">{d.reasons30}</p>
                <Bars data={s.reasons.map((x) => ({ ...x, label: tl(d, x.label) }))} color="var(--status-critical)" />
              </Glass>
            </Reveal>
            <Reveal delay={100}>
              <Glass className="h-full">
                <p className="mb-4 text-sm font-semibold">{d.howPay}</p>
                <Donut data={s.payments.map((x) => ({ ...x, label: tl(d, x.label) }))} center={t.orders} centerLabel={d.orders} />
              </Glass>
            </Reveal>
            <Reveal delay={200}>
              <Glass className="h-full">
                <p className="mb-4 text-sm font-semibold">{d.topCities}</p>
                <Bars data={s.cities.map((x) => ({ ...x, label: tl(d, x.label) }))} color="var(--chart-1)" />
              </Glass>
            </Reveal>
          </div>
          <Reveal delay={150} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {d.calls.map((c) => (
              <div key={c} className="glass rounded-2xl px-4 py-3 text-sm font-medium">
                {c}
              </div>
            ))}
          </Reveal>
        </section>

        {/* ------------------------------------------------ tabs */}
        <section id="tour" className="scroll-mt-20">
          <Head kicker={d.tabsKicker} title={d.tabsTitle} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TABS.map((tab, i) => (
              <Reveal key={tab.id} delay={(i % 3) * 90}>
                <Link href={`/app#${tab.id}`} className="glass lift group block overflow-hidden rounded-3xl">
                  <div className="overflow-hidden border-b border-white/60">
                    <Image loading="eager" src={tab.shot} alt={d.tabAlt(d.tabs[i].name)} width={1440} height={900} className="h-auto w-full transition-transform duration-700 group-hover:scale-[1.04]" />
                  </div>
                  <div className="p-4">
                    <p className="flex items-center justify-between font-semibold">
                      {d.tabs[i].name}
                      <span className="text-muted-foreground font-mono text-xs">{String(i + 1).padStart(2, "0")}</span>
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-sm">{d.tabs[i].line}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ routine */}
        <section id="guide" className="scroll-mt-20">
          <Head kicker={d.routineKicker} title={d.routineTitle} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {d.routine.map((r, i) => (
              <Reveal key={r.when} delay={i * 80}>
                <Glass className="h-full">
                  <p className="font-mono text-2xl font-semibold text-[var(--chart-1)]">{r.time}</p>
                  <p className="mt-1 font-semibold">{r.when}</p>
                  <p className="text-muted-foreground text-xs">{r.who}</p>
                  <p className="mt-3 text-sm">{r.step}</p>
                </Glass>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ value + offer */}
        <section>
          <Head kicker={d.offerKicker} title={d.offerTitle} />
          <ValueAndOffer lang={lang} />
        </section>

        {/* ------------------------------------------------ faq */}
        <section>
          <Head kicker={d.faqKicker} title={d.faqTitle} />
          <div className="grid gap-3 md:grid-cols-2">
            {d.faq.map((f, i) => (
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
          <span>{d.footer}</span>
          <span className="flex gap-4">
            <Link href="/app" className="hover:text-foreground">{d.liveDemo}</Link>
            <a href="#offer" className="hover:text-foreground">{d.makeOffer}</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
