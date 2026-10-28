import { NextResponse } from "next/server";

import { accessRequired } from "@/lib/access";
import { requireRole } from "@/lib/guard";
import { config } from "@/lib/config";
import { shopifyGraphQL } from "@/lib/shopify";
import { demoFetch } from "@/demo/fake-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * What each stored credential is allowed to do — never the credential itself.
 *
 * - Meta: token type, app, scopes, and expiry, from Meta's debug_token.
 * - Shopify: the access scopes granted to the app installation, and which of
 *   them can write.
 * - Bosta: only whether a key is set. Bosta business keys cannot be scoped;
 *   the dashboard only ever calls its search and read endpoints.
 * - Access: whether the gate's settings are present (not their values).
 *
 * Signed-in only, like every other route. Open it after rotating a key to
 * confirm the new one has exactly the access it should.
 */
export async function GET(request: Request) {
  const gate = await requireRole(request, "security-check");
  if ("response" in gate) return gate.response;

  const meta = await (async () => {
    if (!config.meta.accessToken) return { ok: false, error: "META_ACCESS_TOKEN is not set" };
    try {
      const url = new URL(`https://graph.facebook.com/${config.meta.apiVersion}/debug_token`);
      url.searchParams.set("input_token", config.meta.accessToken);
      url.searchParams.set("access_token", config.meta.accessToken);
      const res = await demoFetch(url.toString(), { cache: "no-store" });
      const body = (await res.json()) as {
        data?: {
          is_valid?: boolean;
          type?: string;
          application?: string;
          scopes?: string[];
          expires_at?: number;
        };
        error?: { message?: string };
      };
      const d = body.data ?? {};
      return {
        ok: res.ok && d.is_valid === true,
        type: d.type ?? null,
        application: d.application ?? null,
        scopes: d.scopes ?? [],
        expires:
          d.expires_at === 0 ? "never" : d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
        error: body.error?.message ?? null,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "check failed" };
    }
  })();

  const shopify = await (async () => {
    try {
      const data = await shopifyGraphQL<{
        currentAppInstallation: { accessScopes: Array<{ handle: string }> };
      }>("{ currentAppInstallation { accessScopes { handle } } }", {});
      const scopes = data.currentAppInstallation.accessScopes.map((s) => s.handle).sort();
      return { ok: true, scopes, writeScopes: scopes.filter((s) => s.startsWith("write_")) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "check failed" };
    }
  })();

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      meta,
      shopify,
      bosta: { keySet: Boolean(config.bosta.apiKey) },
      access: {
        required: accessRequired(),
        teamDomainSet: Boolean(process.env.ACCESS_TEAM_DOMAIN),
        audienceSet: Boolean(process.env.ACCESS_AUD),
        allowedEmailSet: Boolean(process.env.ALLOWED_EMAIL),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
