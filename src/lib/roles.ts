/**
 * Who may see what.
 *
 * Cloudflare Access proves *who* someone is; this decides what they get. The
 * split matters because the client and the support member must never see ad
 * spend, cost per purchase, campaign names or the plan — so the gate lives on
 * the server, on every route, not in the UI. Hiding a tab is cosmetic; a
 * refused API response is not.
 */

export type Role = "owner" | "client" | "support";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner — everything",
  client: "Client — sales results only, no ads",
  support: "Support — orders and deliveries only",
};

export const isRole = (value: unknown): value is Role =>
  value === "owner" || value === "client" || value === "support";

/**
 * Tab visibility per role. The client sees only the month view; support sees
 * the operational tabs. Anything touching ads is owner-only.
 */
export const TAB_ROLES: Record<string, Role[]> = {
  month: ["owner", "client", "support"],
  live: ["owner"],
  test: ["owner"],
  insights: ["owner"],
  customers: ["owner", "support"],
  "action-needed": ["owner", "support"],
  "order-issues": ["owner", "support"],
  instapay: ["owner", "support"],
  people: ["owner"],
};

/** Which API routes each role may call. Same list the routes enforce. */
export const API_ROLES: Record<string, Role[]> = {
  month: ["owner", "client", "support"],
  dashboard: ["owner"],
  growth: ["owner"],
  customers: ["owner", "support"],
  "action-needed": ["owner", "support"],
  "order-issues": ["owner", "support"],
  instapay: ["owner", "support"],
  people: ["owner"],
  "security-check": ["owner"],
};

export interface DashboardUser {
  email: string;
  role: Role;
  note: string;
  addedAt: string;
}

/**
 * The owner from the environment, always allowed even with an empty table —
 * otherwise a bad row could lock everyone out of their own dashboard.
 */
export function envOwner(): string {
  return String(process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
}

export async function getUsers(db: D1Database): Promise<DashboardUser[]> {
  const { results } = await db
    .prepare("SELECT email, role, note, added_at FROM dashboard_users ORDER BY added_at")
    .all<{ email: string; role: string; note: string | null; added_at: string }>();
  return results.map((r) => ({
    email: r.email,
    role: isRole(r.role) ? r.role : "support",
    note: r.note ?? "",
    addedAt: r.added_at,
  }));
}

/** The signed-in person's role, or null when they aren't on the list. */
export async function roleOf(db: D1Database, email: string): Promise<Role | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  if (clean === envOwner()) return "owner";
  const row = await db
    .prepare("SELECT role FROM dashboard_users WHERE email = ?1")
    .bind(clean)
    .first<{ role: string }>();
  if (!row) return null;
  return isRole(row.role) ? row.role : "support";
}

export async function upsertUser(
  db: D1Database,
  user: { email: string; role: Role; note: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO dashboard_users (email, role, note, added_at) VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET role = excluded.role, note = excluded.note`,
    )
    .bind(user.email.trim().toLowerCase(), user.role, user.note)
    .run();
}

export async function removeUser(db: D1Database, email: string): Promise<void> {
  await db.prepare("DELETE FROM dashboard_users WHERE email = ?1").bind(email.trim().toLowerCase()).run();
}
