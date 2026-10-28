import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { accessEmail, accessRequired } from "@/lib/access";
import { upsertActionLog, getActionLog } from "@/lib/action-log";
import { getActionNeededDeliveries } from "@/lib/bosta";
import { getActionSnapshot } from "@/lib/bosta-cache";
import { config } from "@/lib/config";
import { isSameOriginJson } from "@/lib/request-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAccess(request: Request): Promise<boolean> {
  if (!accessRequired()) return true;
  return Boolean(await accessEmail(request));
}

export async function GET(request: Request) {
  if (!(await requireAccess(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!config.bosta.apiKey) {
    return NextResponse.json(
      {
        error: "missing_credentials",
        message: "Set BOSTA_API_KEY, then redeploy (or restart the dev server).",
        missing: ["BOSTA_API_KEY"],
      },
      { status: 503 },
    );
  }

  try {
    const { env } = getCloudflareContext();
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const [snapshot, log] = await Promise.all([
      getActionSnapshot(env.DB, getActionNeededDeliveries, { forceRefresh }),
      getActionLog(env.DB),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      fetchedAt: snapshot.fetchedAt,
      cached: snapshot.cached,
      stale: snapshot.stale,
      staleReason: snapshot.staleReason ?? null,
      items: snapshot.items.map((item) => ({
        ...item,
        log: log.get(item.trackingNumber) ?? null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "upstream_failed", message },
      { status: 502 },
    );
  }
}

interface UpdateBody {
  trackingNumber: string;
  orderRef: string;
  contacted: "Yes" | "No" | "No answer";
  reason: string;
  notes: string;
}

/**
 * The one write this app performs — into our own D1 table, never into
 * Bosta, Meta, or Shopify. Records that a call was made and what happened.
 */
export async function POST(request: Request) {
  if (!(await requireAccess(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isSameOriginJson(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.trackingNumber) {
    return NextResponse.json({ error: "missing_tracking_number" }, { status: 400 });
  }
  if (!["Yes", "No", "No answer"].includes(body.contacted)) {
    return NextResponse.json({ error: "invalid_contacted" }, { status: 400 });
  }

  try {
    const { env } = getCloudflareContext();
    await upsertActionLog(env.DB, {
      trackingNumber: body.trackingNumber,
      orderRef: body.orderRef ?? "",
      contacted: body.contacted,
      reason: body.reason ?? "",
      notes: body.notes ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "write_failed", message }, { status: 502 });
  }
}
