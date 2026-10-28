"use client";

import { useEffect, useRef } from "react";
import {
  Activity,
  CalendarDays,
  AlertTriangle,
  FlaskConical,
  Lightbulb,
  PhoneCall,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export interface NavTab {
  id: string;
  label: string;
  /** The shorter name under the icon on phones. */
  short: string;
  icon: LucideIcon;
}

export const NAV_TABS: NavTab[] = [
  { id: "month", label: "Month so far", short: "Month", icon: CalendarDays },
  { id: "live", label: "Live", short: "Live", icon: Activity },
  { id: "test", label: "Test", short: "Test", icon: FlaskConical },
  { id: "insights", label: "Insights", short: "Insights", icon: Lightbulb },
  { id: "customers", label: "Customers", short: "Customers", icon: Users },
  { id: "action-needed", label: "Action Needed", short: "Calls", icon: PhoneCall },
  { id: "order-issues", label: "Order Issues", short: "Issues", icon: AlertTriangle },
  { id: "instapay", label: "Instapay", short: "Instapay", icon: Wallet },
  { id: "people", label: "People", short: "People", icon: UsersRound },
];

/**
 * The phone menu: a frosted bar pinned to the bottom, one icon per tab with
 * its name underneath. Scrolls sideways when the tabs don't fit, and keeps
 * the active tab in view.
 */
export function BottomNav({
  value,
  onChange,
  tabs = NAV_TABS,
}: {
  value: string;
  onChange: (id: string) => void;
  /** Only the tabs this person may open. */
  tabs?: NavTab[];
}) {
  const active = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [value]);

  return (
    <nav
      aria-label="Dashboard sections"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div
        className={cn(
          "relative mx-auto max-w-xl overflow-hidden rounded-[1.75rem]",
          // Liquid glass: translucent fill, strong blur and saturation, a bright
          // top edge and a soft drop shadow.
          "bg-white/55 shadow-[0_8px_32px_rgba(0,0,0,0.18)] ring-1 ring-white/60 backdrop-blur-2xl backdrop-saturate-[1.8]",
          "dark:bg-neutral-900/55 dark:ring-white/10",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/70 before:via-white/10 before:to-transparent before:opacity-60 dark:before:from-white/15",
        )}
      >
        <div className="relative flex snap-x gap-1 overflow-x-auto px-1.5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const selected = tab.id === value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                ref={selected ? active : undefined}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => onChange(tab.id)}
                className={cn(
                  "flex min-w-[4.25rem] shrink-0 snap-center flex-col items-center gap-0.5 rounded-[1.25rem] px-2 pt-1.5 pb-1 transition-all active:scale-95",
                  selected
                    ? "bg-white/80 text-foreground shadow-sm ring-1 ring-black/5 dark:bg-white/15 dark:ring-white/10"
                    : "text-foreground/60",
                )}
              >
                <Icon className={cn("size-[1.35rem]", selected && "stroke-[2.25]")} aria-hidden />
                <span className={cn("text-[10px] leading-tight", selected ? "font-semibold" : "font-medium")}>
                  {tab.short}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
