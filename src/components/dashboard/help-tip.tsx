"use client";

import { Info } from "lucide-react";
import { useRef, useState } from "react";

const WIDTH = 256;
const GUTTER = 16;

/**
 * The ⓘ next to a block's title. Hover on desktop, tap on phones (focus opens
 * it). Says what the block measures and where the number comes from.
 *
 * Positioned against the viewport, because cards clip their overflow.
 */
export function HelpTip({ label, text }: { label: string; text: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function open() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(WIDTH, window.innerWidth - GUTTER * 2);
    const centre = r.left + r.width / 2 - width / 2;
    const left = Math.max(GUTTER, Math.min(centre, window.innerWidth - width - GUTTER));
    setPos({ top: r.bottom + 8, left });
  }

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={ref}
        type="button"
        aria-label={`What is ${label}?`}
        onMouseEnter={open}
        onMouseLeave={() => setPos(null)}
        onFocus={open}
        onBlur={() => setPos(null)}
        className="text-muted-foreground hover:text-foreground focus-visible:text-foreground rounded-full outline-none"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {pos && (
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: Math.min(WIDTH, window.innerWidth - GUTTER * 2) }}
          className="bg-popover text-popover-foreground pointer-events-none fixed z-50 rounded-lg p-3 text-left text-xs leading-relaxed font-normal normal-case tracking-normal shadow-lg ring-1 ring-foreground/10"
        >
          {text}
        </span>
      )}
    </span>
  );
}
