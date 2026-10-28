import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/guard";
import { config } from "@/lib/config";
import { getCustomersReport, getFollowups, saveFollowup } from "@/lib/customers";
import { isSameOriginJson } from "@/lib/request-guard";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Bump whenever `CustomersReport` changes shape. */
const SNAPSHOT_VERSION = 1;

export async function GET(request: Request) {
  const gate = await requireRole(request, "customers");
  if ("response" in gate) return gate.response;
  if (!((config.shopify.clientId && config.shopify.clientSecret) || config.shopify.adminToken)) {
    return NextResponse.json(
      { error: "missing_credentials", message: "Set the Shopify credentials, then redeploy." },
      { status: 503 },
    );
  }

  try {
    const { env } = getCloudflareContext();
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const [snapshot, followups] = await Promise.all([
      getSnapshot(env.DB, "customers_snapshot", SNAPSHOT_VERSION, getCustomersReport, {
        forceRefresh,
        maxAgeMs: 15 * 60 * 1000,
      }),
      getFollowups(env.DB),
    ]);
    return NextResponse.json({
      ...snapshot.data,
      followups,
      fetchedAt: snapshot.fetchedAt,
      stale: snapshot.stale,
      staleReason: snapshot.staleReason ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "upstream_failed", message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const gate = await requireRole(request, "customers");
  if ("response" in gate) return gate.response;
  if (!isSameOriginJson(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { key?: unknown; status?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.key !== "string" || !/^(reorder|checkout):[A-Za-z0-9]{1,40}$/.test(body.key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }
  if (!["messaged", "ordered", "skip", "clear"].includes(String(body.status))) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  try {
    const { env } = getCloudflareContext();
    await saveFollowup(env.DB, {
      key: body.key,
      status: body.status as "messaged" | "ordered" | "skip" | "clear",
      note: String(body.note ?? "").slice(0, 500),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "write_failed", message }, { status: 502 });
  }
}
