/**
 * One gate every API route calls first.
 *
 * `accessEmail` verifies the Cloudflare Access assertion (who), `roleOf` reads
 * the role (what they may see). A route names the roles it serves and gets
 * either the caller or a ready-made 401/403 response.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { accessEmail, accessRequired } from "./access";
import { API_ROLES, envOwner, roleOf, type Role } from "./roles";

export interface Caller {
  email: string;
  role: Role;
  db: D1Database;
}

/**
 * Returns the caller, or a response to return immediately.
 *
 * With Access switched off (local dev) the caller is treated as the owner, so
 * `next dev` works without a tunnel — production always sets REQUIRE_CF_ACCESS.
 */
export async function requireRole(
  request: Request,
  routeKey: keyof typeof API_ROLES,
): Promise<{ caller: Caller } | { response: NextResponse }> {
  const { env } = getCloudflareContext();
  const allowed = API_ROLES[routeKey];

  if (!accessRequired()) {
    return { caller: { email: envOwner() || "dev@localhost", role: "owner", db: env.DB } };
  }

  const email = await accessEmail(request);
  if (!email) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const role = await roleOf(env.DB, email);
  if (!role) {
    return {
      response: NextResponse.json(
        { error: "no_access", message: "This account isn't on the dashboard's list. Ask the owner to add it." },
        { status: 403 },
      ),
    };
  }
  if (!allowed.includes(role)) {
    return {
      response: NextResponse.json(
        { error: "forbidden", message: "Your account doesn't have access to this section." },
        { status: 403 },
      ),
    };
  }

  return { caller: { email, role, db: env.DB } };
}
