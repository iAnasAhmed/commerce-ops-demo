import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { HelpTip } from "@/components/dashboard/help-tip";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value: string;
  /** Small print under the number — say what it means, not what it is. */
  note?: string;
  /** Signed fraction, e.g. 0.34 for +34%. */
  delta?: number | null;
  /** For cost metrics a rise is bad, so the arrow colour has to invert. */
  deltaGoodDirection?: "up" | "down";
  emphasis?: boolean;
  /** Shown on hover or tap: what the block measures and where it comes from. */
  help?: string;
}

export function KpiCard({
  label,
  help,
  value,
  note,
  delta,
  deltaGoodDirection = "up",
  emphasis = false,
}: KpiCardProps) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const rising = hasDelta && delta > 0.0005;
  const falling = hasDelta && delta < -0.0005;
  const good = rising ? deltaGoodDirection === "up" : deltaGoodDirection === "down";

  const DeltaIcon = rising ? ArrowUp : falling ? ArrowDown : Minus;

  return (
    <Card
      className={cn(
        "gap-0 py-5",
        emphasis && "border-foreground/20 bg-muted/40",
      )}
    >
      <CardContent className="px-5">
        <div className="flex items-center gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </p>
          {help && <HelpTip label={label} text={help} />}
        </div>

        <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </p>

        {hasDelta && (rising || falling) && (
          <p
            className={cn(
              "mt-1.5 flex items-center gap-1 text-sm font-medium tabular-nums",
              good
                ? "text-[var(--status-good)]"
                : "text-[var(--status-critical)]",
            )}
          >
            {/* Icon + sign, so the direction never rides on colour alone. */}
            <DeltaIcon className="size-3.5" aria-hidden />
            {rising ? "+" : ""}
            {(delta * 100).toFixed(1)}%
            <span className="text-muted-foreground font-normal">
              vs prior period
            </span>
          </p>
        )}

        {note && (
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            {note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
