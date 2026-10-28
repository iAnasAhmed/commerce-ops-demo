import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/guard";
import { config } from "@/lib/config";
import {
  getInstapayChecks,
  getInstapayOrders,
  INSTAPAY_WINDOW_DAYS,
  saveInstapayCheck,
} from "@/lib/instapay";
import { isSameOriginJson } from "@/lib/request-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const gate = await requireRole(request, "instapay");
  if ("response" in gate) return gate.response;
  if (!config.bosta.apiKey || !((config.shopify.clientId && config.shopify.clientSecret) || config.shopify.adminToken)) {
    return NextResponse.json(
      { error: "missing_credentials", message: "Set the Shopify and Bosta credentials, then redeploy." },
      { status: 503 },
    );
  }

  try {
    const { env } = getCloudflareContext();
    const [orders, checks] = await Promise.all([getInstapayOrders(), getInstapayChecks(env.DB)]);
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      windowDays: INSTAPAY_WINDOW_DAYS,
      orders,
      checks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "upstream_failed", message }, { status: 502 });
  }
}

interface PostBody {
  action: "screenshot";
  orderRef?: string;
  screenshot?: "Yes" | "No";
  note?: string;
}

export async function POST(request: Request) {
  const gate = await requireRole(request, "instapay");
  if ("response" in gate) return gate.response;
  if (!isSameOriginJson(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    if (body.action === "screenshot") {
      if (typeof body.orderRef !== "string" || !/^#?[A-Za-z0-9-]{1,40}$/.test(body.orderRef)) {
        return NextResponse.json({ error: "invalid_order_ref" }, { status: 400 });
      }
      if (body.screenshot !== "Yes" && body.screenshot !== "No") {
        return NextResponse.json({ error: "invalid_screenshot" }, { status: 400 });
      }
      const { env } = getCloudflareContext();
      await saveInstapayCheck(env.DB, {
        orderRef: body.orderRef,
        screenshot: body.screenshot,
        note: String(body.note ?? "").slice(0, 1000),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "write_failed", message }, { status: 502 });
  }
}
