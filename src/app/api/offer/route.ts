import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { isSameOriginJson } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/**
 * "What would this be worth to you?" — the only public write in the demo.
 * Saves the offer to D1 and, when useSend is configured, emails it to the
 * owner. Same-origin JSON only, a hidden honeypot field, and at most 5
 * offers an hour per address.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CURRENCIES = new Set(["EGP", "USD", "SAR", "AED"]);
const PRICING = new Set(["one_time", "monthly", "setup_monthly"]);
const PRICING_LABEL: Record<string, string> = { one_time: "One payment", monthly: "Monthly", setup_monthly: "Setup + monthly" };

const recent = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < 3600_000);
  hits.push(now);
  recent.set(key, hits);
  return hits.length > 5;
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const bad = (message: string) => NextResponse.json({ error: "invalid", message }, { status: 400 });

export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited", message: "Too many offers from this address. Try again in an hour." }, { status: 429 });

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad("The form could not be read.");
  }
  // Honeypot: pretend it worked.
  if (text(b.website, 200)) return NextResponse.json({ ok: true });

  const name = text(b.name, 80);
  const email = text(b.email, 120).toLowerCase();
  const brand = text(b.brand, 80);
  const message = text(b.message, 1500);
  const currency = text(b.currency, 3).toUpperCase();
  const pricing = text(b.pricing, 20);
  const amount = Math.round(Number(b.amount));
  const ordersPerDay = Math.round(Number(b.ordersPerDay)) || null;
  const estimate = Math.round(Number(b.estimate)) || null;
  const needs = Array.isArray(b.needs) ? b.needs.map((n) => text(n, 40)).filter(Boolean).slice(0, 12) : [];

  if (!name) return bad("Please add your name.");
  if (!EMAIL.test(email)) return bad("Please check your email address.");
  if (!Number.isFinite(amount) || amount < 1 || amount > 100_000_000) return bad("Please enter an amount.");
  if (!CURRENCIES.has(currency)) return bad("Please pick a currency.");
  if (!PRICING.has(pricing)) return bad("Please pick how you would like to pay.");

  const id = crypto.randomUUID();
  const { env } = getCloudflareContext();
  try {
    await env.DB.prepare(
      "INSERT INTO offers (id, name, email, brand, orders_per_day, amount, currency, pricing, needs, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, name, email, brand || null, ordersPerDay, amount, currency, pricing, JSON.stringify({ needs, estimate }), message || null)
      .run();
  } catch {
    return NextResponse.json({ error: "save_failed", message: "Your offer could not be saved. Please try again." }, { status: 502 });
  }

  // Email is a bonus: the offer is already saved, so a mail failure is not the visitor's problem.
  const e = env as unknown as Record<string, string | undefined>;
  const base = e.USESEND_URL ?? process.env.USESEND_URL;
  const key = e.USESEND_API_KEY ?? process.env.USESEND_API_KEY;
  const to = e.OFFER_NOTIFY_TO ?? process.env.OFFER_NOTIFY_TO;
  const from = e.OFFER_FROM ?? process.env.OFFER_FROM;
  if (base && key && to && from) {
    const lines = [
      `New offer for the Commerce Ops dashboard`,
      ``,
      `Name: ${name}`,
      `Email: ${email}`,
      `Brand: ${brand || "-"}`,
      `Offer: ${currency} ${amount.toLocaleString("en-US")} (${PRICING_LABEL[pricing]})`,
      `Orders per day: ${ordersPerDay ?? "-"}`,
      `Their estimated monthly value: ${estimate ? `EGP ${estimate.toLocaleString("en-US")}` : "-"}`,
      `Needs: ${needs.join(", ") || "-"}`,
      ``,
      message || "(no message)",
    ];
    try {
      await fetch(`${base.replace(/\/$/, "")}/api/v1/emails`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ to, from, replyTo: email, subject: `Offer: ${currency} ${amount.toLocaleString("en-US")} from ${name}`, text: lines.join("\n") }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      /* saved already */
    }
  }

  return NextResponse.json({ ok: true });
}
