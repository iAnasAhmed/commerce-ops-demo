/**
 * Only the dashboard page itself may write. Another site can't make a
 * signed-in browser send an application/json POST without a CORS preflight
 * (which no route here grants), and a browser always sends Origin on a
 * cross-site POST — so both are required to match.
 */
export function isSameOriginJson(request: Request): boolean {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
