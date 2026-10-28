import { NextResponse } from "next/server";

import { requireRole } from "@/lib/guard";
import { isRole, getUsers, removeUser, upsertUser, envOwner } from "@/lib/roles";
import { isSameOriginJson } from "@/lib/request-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET(request: Request) {
  const gate = await requireRole(request, "people");
  if ("response" in gate) return gate.response;
  return NextResponse.json({ users: await getUsers(gate.caller.db), owner: envOwner() });
}

export async function POST(request: Request) {
  const gate = await requireRole(request, "people");
  if ("response" in gate) return gate.response;
  if (!isSameOriginJson(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { action?: string; email?: string; role?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  // The environment owner is not stored in the table and must stay reachable.
  if (email === envOwner()) return NextResponse.json({ error: "owner_is_fixed" }, { status: 400 });

  try {
    if (body.action === "remove") {
      await removeUser(gate.caller.db, email);
    } else {
      if (!isRole(body.role)) return NextResponse.json({ error: "invalid_role" }, { status: 400 });
      await upsertUser(gate.caller.db, {
        email,
        role: body.role,
        note: String(body.note ?? "").slice(0, 200),
      });
    }
    return NextResponse.json({ ok: true, users: await getUsers(gate.caller.db) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "write_failed", message }, { status: 502 });
  }
}
