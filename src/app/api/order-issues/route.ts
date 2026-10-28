import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/guard";
import { config } from "@/lib/config";
import { getResolutions, reopenOrder, resolveOrder } from "@/lib/issue-resolutions";
import { getOrderIssues } from "@/lib/order-issues";
import { isSameOriginJson } from "@/lib/request-guard";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Bump whenever `OrderIssuesReport` changes shape. */
const SNAPSHOT_VERSION = 2;

export async function GET(request: Request) {
  const gate = await requireRole(request, "order-issues");
  if ("response" in gate) return gate.response;

  const missing: string[] = [];
  if (!config.bosta.apiKey) missing.push("BOSTA_API_KEY");
  const hasShopify =
    (config.shopify.clientId && config.shopify.clientSecret) || config.shopify.adminToken;
  if (!hasShopify) missing.push("SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET");
  if (missing.length) {
    return NextResponse.json(
      {
        error: "missing_credentials",
        message: `Set ${missing.join(" and ")}, then redeploy (or restart the dev server).`,
        missing,
      },
      { status: 503 },
    );
  }

  try {
    const { env } = getCloudflareContext();
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const [snapshot, resolutions] = await Promise.all([
      getSnapshot(env.DB, "order_issues_snapshot", SNAPSHOT_VERSION, getOrderIssues, { forceRefresh }),
      getResolutions(env.DB),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      fetchedAt: snapshot.fetchedAt,
      cached: snapshot.cached,
      stale: snapshot.stale,
      staleReason: snapshot.staleReason ?? null,
      report: snapshot.data,
      resolutions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "upstream_failed", message }, { status: 502 });
  }
}

interface ResolveBody {
  orderRef: string;
  issueKey: string;
  note: string;
  resolved: boolean;
}

/** Mark an order as handled (or reopen it). Writes only to our own D1 table. */
export async function POST(request: Request) {
  const gate = await requireRole(request, "order-issues");
  if ("response" in gate) return gate.response;
  if (!isSameOriginJson(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.orderRef !== "string" || !/^#?[A-Za-z0-9-]{1,40}$/.test(body.orderRef)) {
    return NextResponse.json({ error: "invalid_order_ref" }, { status: 400 });
  }

  try {
    const { env } = getCloudflareContext();
    if (body.resolved) {
      await resolveOrder(env.DB, {
        orderRef: body.orderRef,
        issueKey: String(body.issueKey ?? "").slice(0, 500),
        note: String(body.note ?? "").slice(0, 1000),
      });
    } else {
      await reopenOrder(env.DB, body.orderRef);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "write_failed", message }, { status: 502 });
  }
}
