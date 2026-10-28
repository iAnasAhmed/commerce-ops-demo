import { config } from "./config";
import { demoFetch } from "@/demo/fake-api";

/**
 * Orders support should call — every parcel from the last 7 days where:
 *
 * - the customer cancelled on Bosta's WhatsApp confirmation,
 * - a delivery attempt failed (refused, couldn't reach, postponed), or
 * - Bosta itself cancelled it before any attempt,
 *
 * and it did not end up delivered. Parcels already back with us are kept and
 * marked, because the customer may still want the order re-shipped.
 *
 * Sources, checked against the live account on 13 Sep 2026:
 * - `POST /api/v2/deliveries/search` — newest first, paginated by page/limit
 *   (its `count` always reads 0). Failure reasons are in `state.exception`,
 *   cancellations in `state.canceled`; there is no `attempts` array.
 * - `GET /api/v2/deliveries/business/{tracking}` — only for cancelled parcels.
 *   Its `log` names who cancelled: "Whatsapp Bot" for the customer's WhatsApp
 *   rejection, a hub user or "SF 2 Automation" for Bosta.
 */

export type ReasonCategory =
  | "whatsapp_cancelled"
  | "bosta_cancelled"
  | "refused"
  | "no_answer"
  | "postponed"
  | "other_failed_attempt";

export type CancelledBy = "whatsapp" | "bosta" | "unknown";

export type ParcelWhereabouts = "with_bosta" | "back_with_us" | "closed_by_bosta";

export interface ActionItem {
  trackingNumber: string;
  orderRef: string;
  customerName: string;
  phone: string;
  city: string;
  codAmount: number;
  /** Failed customer-facing delivery attempts. */
  attempts: number;
  firstFailedAt: string | null;
  lastEventAt: string | null;
  lastReason: string;
  reasonCategory: ReasonCategory;
  cancelledBy: CancelledBy | null;
  whereabouts: ParcelWhereabouts;
  type: string;
  status: string;
}

const REASON_PATTERNS: Array<{ category: ReasonCategory; pattern: RegExp }> = [
  { category: "refused", pattern: /refuses|refused|opened by force|wants to open|product issue/i },
  { category: "postponed", pattern: /postpon/i },
  {
    category: "no_answer",
    pattern: /not answering|phone is off|no answer|not in the address|wrong phone|changed the address/i,
  },
];

function categorize(reason: string): ReasonCategory {
  for (const { category, pattern } of REASON_PATTERNS) {
    if (pattern.test(reason)) return category;
  }
  return "other_failed_attempt";
}

interface BostaException {
  reason?: string;
  time?: string;
  /** "delivery" for courier-to-customer attempts, "return" when bringing it back to us. */
  attemptType?: string;
}

export interface BostaDelivery {
  trackingNumber?: string;
  businessReference?: string;
  cod?: number;
  type?: { value?: string };
  state?: {
    value?: string;
    code?: number;
    exception?: BostaException[];
    canceled?: { time?: string };
  };
  receiver?: { fullName?: string; phone?: string };
  dropOffAddress?: { city?: { name?: string } };
  attemptsCount?: number;
  createdAt?: string;
  updatedAt?: string;
  /** Bosta's own "running late" flag. */
  isDelayed?: boolean;
}

export interface BostaLogEntry {
  time?: string;
  takenBy?: { userName?: string; userRole?: string };
}

const DELIVERED = 45;
const RETURNED_TO_BUSINESS = 46;
const TERMINATED = 48;
/** Bosta code 47 — "Exception", waiting on the business to act. */
const AWAITING_ACTION = 47;
/** Customer-return pickups are a different flow and never need this call. */
const TRACKED_TYPES = new Set(["Send", "Return to Origin"]);

const DAY_MS = 24 * 60 * 60 * 1000;
/** Show parcels whose latest failure or cancellation is this recent. */
const LOOKBACK_DAYS = 7;
/** Read further back, so an older order that failed this week still shows. */
const FETCH_DAYS = 21;
const PAGE_SIZE = 200;
const MAX_PAGES = 5;
const MAX_ATTEMPTS = 3;
const DETAIL_CONCURRENCY = 10;

/**
 * v2 sent no rate-limit headers and served 30 parallel calls without a 429
 * (tested 13 Sep 2026) — the 60/minute cap only applies to v0. Retrying on
 * 429/5xx anyway, honouring Retry-After, survives a limit appearing later.
 */
async function bostaFetch(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await demoFetch(url, init);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) return response;

    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 10) * 1000
        : 1000 * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error("Bosta request retries exhausted");
}

async function searchPage(page: number): Promise<BostaDelivery[]> {
  const response = await bostaFetch("https://app.bosta.co/api/v2/deliveries/search", {
    method: "POST",
    headers: {
      Authorization: config.bosta.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page, limit: PAGE_SIZE }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bosta search failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as { data?: { deliveries?: BostaDelivery[] } };
  return json.data?.deliveries ?? [];
}

export interface BostaDeliveryDetail {
  log: BostaLogEntry[];
  /** An online payment taken by Bosta — at the door, or by a pay link before delivery. */
  paymentInfo: {
    amount?: number;
    capturedStatus?: string;
    method?: string;
    provider?: string;
  } | null;
}

/** One parcel's full record: who did what, and any online payment Bosta took. */
export async function getDeliveryDetail(trackingNumber: string): Promise<BostaDeliveryDetail | null> {
  const response = await bostaFetch(
    `https://app.bosta.co/api/v2/deliveries/business/${encodeURIComponent(trackingNumber)}`,
    { headers: { Authorization: config.bosta.apiKey } },
  );
  if (!response.ok) return null;

  const json = (await response.json()) as {
    data?: { log?: BostaLogEntry[]; paymentInfo?: BostaDeliveryDetail["paymentInfo"] };
  };
  return { log: json.data?.log ?? [], paymentInfo: json.data?.paymentInfo ?? null };
}

/** Who cancelled, from a parcel's log — the actor within two minutes of the cancel time. */
export function whoCancelled(log: BostaLogEntry[], cancelledAt: string): CancelledBy {
  const at = new Date(cancelledAt).getTime();
  const actors = log
    .filter((entry) => entry.time && Math.abs(new Date(entry.time).getTime() - at) < 2 * 60 * 1000)
    .map((entry) => entry.takenBy)
    .filter((by) => by?.userName && by.userName !== "Hub Assignment");

  if (actors.some((by) => /whatsapp/i.test(`${by?.userName} ${by?.userRole}`))) {
    return "whatsapp";
  }
  return actors.length ? "bosta" : "unknown";
}

async function getCancelledBy(trackingNumber: string, cancelledAt: string): Promise<CancelledBy> {
  try {
    const detail = await getDeliveryDetail(trackingNumber);
    return detail ? whoCancelled(detail.log, cancelledAt) : "unknown";
  } catch {
    return "unknown";
  }
}

interface Candidate {
  item: Omit<ActionItem, "lastReason" | "reasonCategory" | "cancelledBy">;
  cancelledAt: string | null;
  lastExceptionReason: string | null;
}

function toCandidate(raw: BostaDelivery): Candidate | null {
  const code = raw.state?.code;
  if (code === undefined || code === DELIVERED) return null;
  if (!TRACKED_TYPES.has(raw.type?.value ?? "")) return null;

  // Exceptions logged while bringing a parcel back ("Business is not
  // answering") are Bosta calling us, not a customer problem.
  const failures = (raw.state?.exception ?? [])
    .filter((e) => e.attemptType !== "return" && e.reason)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const cancelledAt = raw.state?.canceled?.time ?? null;

  if (failures.length === 0 && !cancelledAt && code !== AWAITING_ACTION) return null;

  const last = failures[failures.length - 1];
  const eventTimes = [last?.time, cancelledAt].filter((t): t is string => Boolean(t));
  const lastEventAt = eventTimes.sort().pop() ?? raw.updatedAt ?? null;

  const whereabouts: ParcelWhereabouts =
    code === RETURNED_TO_BUSINESS
      ? "back_with_us"
      : code === TERMINATED
        ? "closed_by_bosta"
        : "with_bosta";

  return {
    item: {
      trackingNumber: raw.trackingNumber ?? "",
      orderRef: (raw.businessReference ?? "").replace(/^.*:/, ""),
      customerName: raw.receiver?.fullName ?? "",
      phone: raw.receiver?.phone ?? "",
      city: raw.dropOffAddress?.city?.name ?? "",
      codAmount: Number(raw.cod ?? 0),
      attempts: failures.length,
      firstFailedAt: failures[0]?.time ?? null,
      lastEventAt,
      whereabouts,
      type: raw.type?.value ?? "",
      status: raw.state?.value ?? "",
    },
    cancelledAt,
    lastExceptionReason: last?.reason ?? null,
  };
}

function finalize(candidate: Candidate, cancelledBy: CancelledBy | null): ActionItem {
  const { item, cancelledAt, lastExceptionReason } = candidate;

  if (lastExceptionReason) {
    return {
      ...item,
      lastReason: lastExceptionReason,
      reasonCategory: categorize(lastExceptionReason),
      cancelledBy,
    };
  }

  if (cancelledAt) {
    if (cancelledBy === "whatsapp") {
      return {
        ...item,
        lastReason: "Customer cancelled on Bosta's WhatsApp confirmation",
        reasonCategory: "whatsapp_cancelled",
        cancelledBy,
      };
    }
    return {
      ...item,
      lastReason:
        cancelledBy === "bosta"
          ? "Cancelled by Bosta before any delivery attempt"
          : "Cancelled before any delivery attempt — Bosta's log doesn't say who",
      reasonCategory: "bosta_cancelled",
      cancelledBy,
    };
  }

  return {
    ...item,
    lastReason: item.status || "Waiting for action",
    reasonCategory: "other_failed_attempt",
    cancelledBy: null,
  };
}

/** Every parcel created in the last `days`, newest first, paging until older than that. */
export async function searchRecentDeliveries(days: number): Promise<BostaDelivery[]> {
  if (!config.bosta.apiKey) {
    throw new Error("BOSTA_API_KEY is not set.");
  }

  const cutoff = Date.now() - days * DAY_MS;
  const deliveries: BostaDelivery[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await searchPage(page);
    deliveries.push(...batch);
    const oldest = batch[batch.length - 1]?.createdAt;
    if (batch.length < PAGE_SIZE || !oldest || new Date(oldest).getTime() < cutoff) {
      break;
    }
  }
  return deliveries.filter((d) => d.createdAt && new Date(d.createdAt).getTime() >= cutoff);
}

export async function mapPool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

/**
 * Throws on a missing key or a failed search, like `meta.ts` and
 * `shopify.ts`. A failed who-cancelled lookup does not throw — that parcel is
 * simply listed as cancelled by Bosta with "doesn't say who".
 */
export async function getActionNeededDeliveries(): Promise<ActionItem[]> {
  if (!config.bosta.apiKey) {
    throw new Error("BOSTA_API_KEY is not set.");
  }

  const now = Date.now();
  const fetchCutoff = now - FETCH_DAYS * DAY_MS;
  const eventCutoff = now - LOOKBACK_DAYS * DAY_MS;

  const deliveries = await searchRecentDeliveries(FETCH_DAYS);

  const seen = new Set<string>();
  const candidates = deliveries
    .filter((d) => d.createdAt && new Date(d.createdAt).getTime() >= fetchCutoff)
    .map(toCandidate)
    .filter((c): c is Candidate => {
      if (!c || !c.item.lastEventAt) return false;
      // A parcel still out for delivery stays however old its failed attempt
      // is — the courier will try again, so a call can still save it.
      const stillOutForDelivery = c.item.type === "Send" && c.item.whereabouts === "with_bosta";
      if (!stillOutForDelivery && new Date(c.item.lastEventAt).getTime() < eventCutoff) {
        return false;
      }
      if (seen.has(c.item.trackingNumber)) return false;
      seen.add(c.item.trackingNumber);
      return true;
    });

  const cancelledBy = await mapPool(candidates, DETAIL_CONCURRENCY, (c) =>
    c.cancelledAt ? getCancelledBy(c.item.trackingNumber, c.cancelledAt) : Promise.resolve(null),
  );

  return candidates
    .map((c, i) => finalize(c, cancelledBy[i]))
    .sort((a, b) => (b.lastEventAt ?? "").localeCompare(a.lastEventAt ?? ""));
}
