/**
 * Cloudflare Access JWT verification.
 *
 * Cloudflare Access is the outer gate: it handles "Continue with Google" and
 * only lets the allowlisted account through. But an outer gate alone trusts
 * whatever reaches the origin, so this module independently verifies the
 * assertion Access attaches to every request — signature, issuer, audience,
 * expiry and email. If someone reached the Worker without going through
 * Access, the token is missing and the request is denied.
 *
 * This mirrors the order-automation app's security helper in the
 * project. Web Crypto only, so it runs unchanged on the edge.
 */

interface AccessJwtPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  email?: string;
}

interface AccessJwtHeader {
  alg?: string;
  kid?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Cloudflare rotates signing keys, so the key set is cached for an hour
 * rather than fetched on every request. A cold isolate simply refetches.
 */
let keyCache: { domain: string; expiresAt: number; keys: JsonWebKey[] } = {
  domain: "",
  expiresAt: 0,
  keys: [],
};

/**
 * Backed by a plain ArrayBuffer rather than ArrayBufferLike, so the result is
 * accepted directly as a BufferSource by crypto.subtle.
 */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(decoder.decode(base64UrlToBytes(segment))) as T;
}

async function accessKeys(teamDomain: string): Promise<JsonWebKey[]> {
  if (keyCache.domain === teamDomain && Date.now() < keyCache.expiresAt) {
    return keyCache.keys;
  }

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error("Could not load Cloudflare Access certificates.");
  }

  const body = (await response.json()) as { keys?: JsonWebKey[] };
  keyCache = {
    domain: teamDomain,
    expiresAt: Date.now() + 60 * 60 * 1000,
    keys: body.keys ?? [],
  };
  return keyCache.keys;
}

/** The signed-in email, or "" when the request carries no valid assertion. */
export async function accessEmail(request: Request): Promise<string> {
  try {
    const teamDomain = String(process.env.ACCESS_TEAM_DOMAIN ?? "")
      .trim()
      .toLowerCase();
    const audience = String(process.env.ACCESS_AUD ?? "").trim();
    if (!teamDomain || !audience) return "";

    const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? "";
    const [encodedHeader, encodedPayload, encodedSignature, extra] =
      token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature || extra) {
      return "";
    }

    const header = decodeSegment<AccessJwtHeader>(encodedHeader);
    if (header.alg !== "RS256" || !header.kid) return "";

    const jwk = (await accessKeys(teamDomain)).find(
      (key) => (key as JsonWebKey & { kid?: string }).kid === header.kid,
    );
    if (!jwk) return "";

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(encodedSignature),
      encoder.encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!signatureValid) return "";

    const payload = decodeSegment<AccessJwtPayload>(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud)
      ? payload.aud
      : [payload.aud ?? ""];
    const email = String(payload.email ?? "").toLowerCase();

    /**
     * Which email is allowed is no longer decided here — the dashboard now has
     * several people on it (owner, client, support) and `roles.ts` holds that
     * list. This module's job is only to prove the assertion is genuine and
     * say whose it is; `guard.ts` decides what that person may see.
     */
    const valid =
      Number(payload.exp) > now &&
      (!payload.nbf || Number(payload.nbf) <= now) &&
      payload.iss === `https://${teamDomain}` &&
      audiences.includes(audience) &&
      Boolean(email);

    return valid ? email : "";
  } catch {
    return "";
  }
}

/**
 * Whether Access must be satisfied. Set REQUIRE_CF_ACCESS=true in production;
 * leave it unset locally so `next dev` works without a tunnel.
 */
export function accessRequired(): boolean {
  return String(process.env.REQUIRE_CF_ACCESS ?? "").toLowerCase() === "true";
}
