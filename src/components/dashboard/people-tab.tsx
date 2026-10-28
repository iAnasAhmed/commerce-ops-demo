"use client";

import { useState } from "react";
import { Crown, Eye, Headphones, Trash2, UserPlus } from "lucide-react";

import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel, SectionError, useShared } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABEL, type DashboardUser, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

interface Response {
  users: DashboardUser[];
  owner: string;
}

const ROLE_ICON: Record<Role, typeof Crown> = { owner: Crown, client: Eye, support: Headphones };

const SEES: Record<Role, string> = {
  owner: "Everything, including ads, budgets and the plan.",
  client: "Month so far only — sales, orders, deliveries, best sellers. No ad spend, no cost per order, no campaigns.",
  support: "Month so far, orders to call, order issues, Instapay and customers. No ads.",
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { users?: DashboardUser[]; error?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? json.error ?? "Couldn't save");
  return json;
}

export function PeopleTab() {
  const { data, error, loading, reload, setData } = useShared<Response>("/api/people");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("client");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (!data && loading) return <Skeleton className="h-64 rounded-xl" />;
  if (!data) return <SectionError message={error ?? "Could not load the people list"} />;

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setFailed(null);
    try {
      const json = await post(body);
      if (json.users) setData((d) => d && { ...d, users: json.users! });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn't save");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
          People
          <HelpTip
            label="People"
            text="Who can open this dashboard and what each person sees. The limits are enforced on the server, so a client cannot reach the ads data even by typing the address directly."
          />
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">
          They also need to be allowed in Cloudflare Access with the same email, or they never reach the dashboard.
        </p>
      </div>

      <Panel title="Add someone" help="Use the exact Google address they sign in with. Roles can be changed later.">
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
          <input
            className="border-border bg-background h-9 rounded-lg border px-3 text-sm"
            placeholder="name@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            aria-label="Role"
            className="border-border bg-background h-9 rounded-lg border px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <input
            className="border-border bg-background h-9 rounded-lg border px-3 text-sm"
            placeholder="Note (e.g. Sara — client)"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            className="h-9"
            disabled={busy || !email.includes("@")}
            onClick={() =>
              void save({ email, role, note }).then(() => {
                setEmail("");
                setNote("");
              })
            }
          >
            <UserPlus />
            Add
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">{SEES[role]}</p>
        {failed && <p className="mt-2 text-sm text-red-600">{failed}</p>}
      </Panel>

      <Panel title="Who has access" help="The owner address is set in the deployment and can't be removed here.">
        <div className="space-y-2">
          <Row email={data.owner} role="owner" note="Owner — set in the deployment" fixed />
          {data.users.map((u) => (
            <Row
              key={u.email}
              email={u.email}
              role={u.role}
              note={u.note}
              busy={busy}
              onRole={(next) => void save({ email: u.email, role: next, note: u.note })}
              onRemove={() => void save({ action: "remove", email: u.email })}
            />
          ))}
          {data.users.length === 0 && (
            <p className="text-muted-foreground py-3 text-sm">
              Nobody else has been added yet — only you can open the dashboard.
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => void reload(true)}>
          Refresh
        </Button>
      </Panel>
    </div>
  );
}

function Row({
  email,
  role,
  note,
  fixed,
  busy,
  onRole,
  onRemove,
}: {
  email: string;
  role: Role;
  note: string;
  fixed?: boolean;
  busy?: boolean;
  onRole?: (role: Role) => void;
  onRemove?: () => void;
}) {
  const Icon = ROLE_ICON[role];
  return (
    <div className="bg-muted/30 flex flex-wrap items-center gap-3 rounded-lg p-3 ring-1 ring-foreground/5">
      <Icon className={cn("size-4 shrink-0", role === "owner" && "text-[var(--status-warning)]")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{email}</p>
        <p className="text-muted-foreground truncate text-xs">{note || SEES[role]}</p>
      </div>
      {fixed ? (
        <span className="text-muted-foreground text-xs">Fixed</span>
      ) : (
        <>
          <select
            aria-label={`Role for ${email}`}
            className="border-border bg-background h-8 rounded-lg border px-2 text-sm"
            value={role}
            disabled={busy}
            onChange={(e) => onRole?.(e.target.value as Role)}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Remove ${email}`}
            disabled={busy}
            onClick={onRemove}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
