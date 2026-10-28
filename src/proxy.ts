import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { accessEmail, accessRequired } from "@/lib/access";

/**
 * The gate, and the only place security headers are set.
 *
 * Cloudflare Access authenticates with "Continue with Google" in front of this
 * Worker. Here we verify its assertion again rather than trusting the hop, so
 * a request that somehow bypassed Access is refused. Fails closed: when
 * REQUIRE_CF_ACCESS=true, a missing or invalid token is denied.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`. The old filename is silently
 * ignored, so this file must keep this name.
 */

function secure(response: NextResponse): NextResponse {
  // The dashboard shows revenue and customer order counts. Never cache it,
  // in the browser or in any shared cache.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      // Next injects inline styles and its bootstrap script.
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; "),
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

/** Public demo: visitors can click everything, but only the offer form saves. */
function demoReadOnly(request: NextRequest): NextResponse | null {
  if (process.env.DEMO_READONLY !== "true") return null;
  if (request.method === "GET" || request.method === "HEAD") return null;
  if (request.nextUrl.pathname === "/api/offer") return null;
  return secure(
    NextResponse.json(
      { error: "demo_readonly", message: "This is a public demo, so changes aren't saved." },
      { status: 403 },
    ),
  );
}

export async function proxy(request: NextRequest) {
  const blocked = demoReadOnly(request);
  if (blocked) return blocked;
  if (!accessRequired()) {
    // Local development: no Access in front, so nothing to verify.
    return secure(NextResponse.next());
  }

  const email = await accessEmail(request);
  if (email) {
    return secure(NextResponse.next());
  }

  // No usable identity. The API answers in JSON; everything else gets a plain
  // refusal rather than a login form, because Access owns the login screen.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return secure(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
  }

  return secure(
    new NextResponse("Not authorized.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }) as NextResponse,
  );
}

export const config = {
  /**
   * Everything except Next's own static output. Without this the gate would
   * also block the CSS and JS the page needs, and the refusal page would
   * render unstyled.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
