"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CountUp, useInView } from "./motion";

const C = {
  blue: "var(--chart-1)",
  orange: "var(--chart-2)",
  green: "var(--chart-3)",
  amber: "var(--chart-4)",
  pink: "var(--chart-5)",
  red: "var(--status-critical)",
  grid: "oklch(0.55 0 0 / 0.12)",
};

const tip = {
  contentStyle: {
    background: "oklch(1 0 0 / 0.8)",
    backdropFilter: "blur(12px)",
    border: "1px solid oklch(1 0 0 / 0.7)",
    borderRadius: 12,
    boxShadow: "0 8px 30px oklch(0.3 0.05 260 / 0.15)",
    fontSize: 12,
  },
};

/** Renders children only once on screen, so chart animations play when seen. */
function Lazy({ height, children }: { height: number; children: React.ReactNode }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {seen && children}
    </div>
  );
}

export function DailyChart({ data }: { data: Array<{ day: string; delivered: number; failed: number }> }) {
  return (
    <Lazy height={240}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="gDel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.green} stopOpacity={0.55} />
              <stop offset="100%" stopColor={C.green} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="gFail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.red} stopOpacity={0.6} />
              <stop offset="100%" stopColor={C.red} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} interval={6} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
          <Tooltip {...tip} />
          <Area type="monotone" dataKey="delivered" name="Delivered" stackId="1" stroke={C.green} strokeWidth={2} fill="url(#gDel)" animationDuration={1400} />
          <Area type="monotone" dataKey="failed" name="Failed" stackId="1" stroke={C.red} strokeWidth={2} fill="url(#gFail)" animationDuration={1400} animationBegin={300} />
        </AreaChart>
      </ResponsiveContainer>
    </Lazy>
  );
}

export function CppChart({ data }: { data: Array<{ week: string; meta: number; real: number }> }) {
  return (
    <Lazy height={240}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} />
          <Tooltip {...tip} formatter={(v) => `EGP ${Number(v).toLocaleString("en-US")}`} />
          <Line type="monotone" dataKey="meta" name="Meta says" stroke={C.blue} strokeWidth={2.5} dot={false} animationDuration={1500} />
          <Line type="monotone" dataKey="real" name="Real (delivered)" stroke={C.orange} strokeWidth={3} dot={{ r: 3 }} animationDuration={1500} animationBegin={250} />
        </LineChart>
      </ResponsiveContainer>
    </Lazy>
  );
}

const DONUT = [C.blue, C.orange, C.green, C.amber, C.pink, C.red];

export function Donut({
  data,
  center,
  centerLabel,
  colors = DONUT,
}: {
  data: Array<{ label: string; value: number }>;
  center: number;
  centerLabel: string;
  colors?: string[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative size-44 shrink-0">
        <Lazy height={176}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius={56} outerRadius={84} paddingAngle={3} cornerRadius={6} stroke="none" animationDuration={1300}>
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip {...tip} />
            </PieChart>
          </ResponsiveContainer>
        </Lazy>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-mono text-3xl font-semibold">
              <CountUp value={center} />
            </p>
            <p className="text-muted-foreground text-[11px]">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <i className="size-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />
              {d.label}
            </span>
            <span className="text-muted-foreground font-mono tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars that grow in when seen. */
export function Bars({ data, color = C.blue, suffix = "" }: { data: Array<{ label: string; value: number }>; color?: string; suffix?: string }) {
  const [ref, seen] = useInView<HTMLUListElement>();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul ref={ref} className="space-y-3">
      {data.map((d, i) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{d.label}</span>
            <span className="font-mono tabular-nums">
              {d.value.toLocaleString("en-US")}
              {suffix}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-black/5">
            <div
              className="h-full rounded-full transition-[width] duration-[1200ms] ease-[cubic-bezier(.22,1,.36,1)]"
              style={{ width: seen ? `${(d.value / max) * 100}%` : "0%", background: color, transitionDelay: `${i * 90}ms` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Meta → Shopify → delivered, as shrinking bars. */
export function Funnel({ data }: { data: Array<{ label: string; value: number }> }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const max = data[0]?.value || 1;
  const colors = [C.blue, C.amber, C.green];
  return (
    <div ref={ref} className="space-y-3">
      {data.map((d, i) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm">{d.label}</span>
            <span className="font-mono text-xl font-semibold">
              <CountUp value={d.value} />
            </span>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-black/5">
            <div
              className="h-full rounded-full transition-[width] duration-[1400ms] ease-[cubic-bezier(.22,1,.36,1)]"
              style={{ width: seen ? `${(d.value / max) * 100}%` : "0%", background: colors[i], transitionDelay: `${i * 180}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
