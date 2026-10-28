import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Alert as AlertItem } from "@/lib/metrics";
import { HelpTip } from "@/components/dashboard/help-tip";

// Icon + label, never colour alone.
const tone = {
  critical: {
    Icon: CircleAlert,
    color: "var(--status-critical)",
    word: "Critical",
  },
  warning: {
    Icon: TriangleAlert,
    color: "var(--status-warning)",
    word: "Warning",
  },
  info: { Icon: Info, color: "var(--status-good)", word: "Clear" },
};

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          What needs a decision
          <HelpTip label="What needs a decision" text="Warnings the dashboard raises automatically when a number crosses a threshold (e.g. cost per purchase too high, frequency too high). Each one says what to look at. Thresholds live in src/lib/config.ts." />
        </CardTitle>
        <CardDescription>
          Derived from the thresholds in <code>src/lib/config.ts</code> — change
          them there, not here.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {alerts.map((alert, i) => {
          const t = tone[alert.level];
          return (
            <div
              key={i}
              className="flex gap-3 rounded-lg border p-3.5"
              style={{ borderLeft: `3px solid ${t.color}` }}
            >
              <t.Icon
                className="mt-0.5 size-4 shrink-0"
                style={{ color: t.color }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  <span className="sr-only">{t.word}: </span>
                  {alert.title}
                </p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {alert.detail}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
