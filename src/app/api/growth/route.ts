import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/guard";
import { assertConfigured, config } from "@/lib/config";
import { getGrowthReport } from "@/lib/growth";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Bump whenever `GrowthReport` changes shape. */
const SNAPSHOT_VERSION = 1;

export async function GET(request: Request) {
  const gate = await requireRole(request, "growth");
  if ("response" in gate) return gate.response;
  const missing = assertConfigured();
  if (!config.bosta.apiKey) missing.push("BOSTA_API_KEY");
  if (missing.length) {
    return NextResponse.json(
      { error: "missing_credentials", message: `Set ${missing.join(", ")}, then redeploy.`, missing },
      { status: 503 },
    );
  }

  try {
    const { env } = getCloudflareContext();
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const snapshot = await getSnapshot(env.DB, "growth_snapshot", SNAPSHOT_VERSION, getGrowthReport, {
      forceRefresh,
      maxAgeMs: 10 * 60 * 1000,
    });
    return NextResponse.json({
      ...snapshot.data,
      fetchedAt: snapshot.fetchedAt,
      cached: snapshot.cached,
      stale: snapshot.stale,
      staleReason: snapshot.staleReason ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "upstream_failed", message }, { status: 502 });
  }
}
