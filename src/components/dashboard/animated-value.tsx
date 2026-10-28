"use client";

import { useEffect, useState } from "react";

/**
 * Counts the first number in a value up from zero, keeping any text around
 * it ("EGP 1,215" or "12.5%"). Anything without a number shows as is.
 */
export function AnimatedValue({ value }: { value: React.ReactNode }) {
  const text = typeof value === "number" ? value.toLocaleString("en-US") : typeof value === "string" ? value : null;
  const m = text?.match(/^(.*?)(-?\d[\d,]*(?:\.\d+)?)([\s\S]*)$/) ?? null;
  const target = m ? Number(m[2].replace(/,/g, "")) : 0;
  const decimals = m?.[2].includes(".") ? m[2].split(".")[1].length : 0;
  const [n, setN] = useState(target);

  useEffect(() => {
    if (!m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1100);
      setN(target * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!m) return <>{value}</>;
  const grouped = m[2].includes(",") || Math.abs(target) >= 1000;
  const shown = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  return (
    <>
      {m[1]}
      {shown}
      {m[3]}
    </>
  );
}
