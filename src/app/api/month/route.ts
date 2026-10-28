import { NextResponse } from "next/server";

import { config } from "@/lib/config";
import { requireRole } from "@/lib/guard";
import { getMonthReport } from "@/lib/month";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Bump whenever `MonthReport` changes shape. */
const SNAPSHOT_VERSION = 1;

export async function GET(request: Request) {
  const gate = await requireRole(request, "month");
  if ("response" in gate) return gate.response;
  const { caller } = gate;

  if (!((config.shopify.clientId && config.shopify.clientSecret) || config.shopify.adminToken)) {
    return NextResponse.json(
      { error: "missing_credentials", message: "Set the Shopify credentials, then redeploy." },
      { status: 503 },
    );
  }

  try {
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const snapshot = await getSnapshot(caller.db, "month_snapshot", SNAPSHOT_VERSION, getMonthReport, {
      forceRefresh,
      maxAgeMs: 10 * 60 * 1000,
    });

    /**
     * Ad spend, cost per purchase and MER never reach a client or support
     * browser — they are removed from the payload here, not hidden in the UI.
     */
    const data = caller.role === "owner" ? snapshot.data : { ...snapshot.data, ads: null };

    return NextResponse.json({
      ...data,
      role: caller.role,
      fetchedAt: snapshot.fetchedAt,
      stale: snapshot.stale,
      staleReason: snapshot.staleReason ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "upstream_failed", message }, { status: 502 });
  }
}
