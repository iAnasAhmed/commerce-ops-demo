/**
 * The demo world: a made-up Egyptian beauty brand, "Velora Cosmetics".
 *
 * Every order, parcel and ad number here is generated. The scale follows a real
 * brand of this size (about 15–20 orders a day, EGP 1,100–1,500 average order,
 * EGP ~4,600 a day on Meta, ~11.6% failed deliveries), but no real customer,
 * order or account appears anywhere.
 *
 * The world is rebuilt once per Cairo day, so it stays stable while you click
 * around. Orders "arrive" through the day (anything after now is hidden), and
 * parcels move through Bosta's stages as time passes.
 */

export const BRAND = {
  name: "Velora Cosmetics",
  short: "Velora",
  prefix: "#VL",
  storeDomain: "velora-demo.myshopify.com",
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 100;

// ------------------------------------------------------------------ random

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator, so the same seed always gives the same world. */
export function rng(seed: string) {
  let a = hash(seed) || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
    weighted: <T,>(list: ReadonlyArray<readonly [T, number]>) => {
      const total = list.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of list) {
        r -= w;
        if (r <= 0) return v;
      }
      return list[list.length - 1][0];
    },
  };
}

// ------------------------------------------------------------------ catalogue

export const PRODUCTS = [
  { title: "Velvet Matte Lip Kit", price: 650, weight: 16, stock: 140 },
  { title: "Glow Drops Serum", price: 890, weight: 13, stock: 64 },
  { title: "Travel Duo", price: 1150, weight: 18, stock: 210 },
  { title: "Golden Hour Palette", price: 1350, weight: 9, stock: 0 },
  { title: "Brow Sculpt Gel", price: 420, weight: 8, stock: 95 },
  { title: "Hydra Grip Primer", price: 780, weight: 10, stock: 12 },
  { title: "Rose Setting Spray", price: 560, weight: 9, stock: 180 },
  { title: "Lash Lift Mascara", price: 480, weight: 9, stock: 7 },
  { title: "Bridal Glow Set", price: 2450, weight: 4, stock: 33 },
] as const;

const FIRST = ["Mariam", "Nour", "Salma", "Yasmin", "Farida", "Hana", "Malak", "Jana", "Rana", "Habiba", "Laila", "Aya", "Dina", "Reem", "Sara", "Mona", "Nada", "Heba", "Rowan", "Menna", "Shahd", "Esraa", "Basma", "Omnia", "Ahmed", "Omar"];
const LAST = ["Hassan", "Mostafa", "Adel", "Samir", "Fathy", "Kamal", "Nabil", "Ashraf", "Tarek", "Gamal", "Saad", "Hamdy", "Lotfy", "Magdy", "Fawzy", "Ezzat"];

export const CITIES: ReadonlyArray<readonly [string, number]> = [
  ["Cairo", 34], ["Giza", 20], ["Alexandria", 13], ["Qalyubia", 6], ["Sharqia", 4], ["Dakahlia", 4],
  ["Gharbia", 3], ["Monufia", 3], ["Beheira", 2], ["Ismailia", 2], ["Port Said", 2], ["Suez", 1.5],
  ["Red Sea", 1.5], ["Assiut", 1.5], ["Minya", 1.5], ["Sohag", 1],
];
/** Failed-delivery risk by city: further from Cairo fails more often. */
const CITY_RISK: Record<string, number> = { Cairo: 0.85, Giza: 0.9, Alexandria: 1, Qalyubia: 1.2, "Red Sea": 1.6, Assiut: 1.7, Minya: 1.8, Sohag: 1.9 };

const LANDING = [
  ["/products/travel-duo", 22], ["/products/velvet-matte-lip-kit", 18], ["/", 16], ["/products/glow-drops-serum", 12],
  ["/collections/all", 8], ["/pages/bundle-offer", 9], ["/products/golden-hour-palette", 6], ["/products/hydra-grip-primer", 5],
] as const;

// ------------------------------------------------------------------ types

export type Payment = "cod" | "card" | "instapay";
export type Outcome = "delivered" | "refused" | "no_answer" | "postponed" | "whatsapp_cancel" | "bosta_cancel";

export interface LineItem { title: string; quantity: number; price: number; unfulfilled: number }

export interface Customer { id: string; first: string; last: string; phone: string; city: string }

export interface Order {
  index: number;
  name: string;
  createdAt: number;
  customer: Customer;
  items: LineItem[];
  shipping: number;
  discount: number;
  total: number;
  payment: Payment;
  /** Instapay transfer not confirmed in Shopify. */
  pending: boolean;
  cancelledAt: number | null;
  landingPage: string;
  /** How the parcel plays out. */
  plan: ParcelPlan | null;
}

export interface ParcelPlan {
  tracking: string;
  createdAfterH: number;
  pickupAfterH: number;
  attemptAfterH: number;
  outcome: Outcome;
  cod: number;
  /** COD paid by card at the door through Bosta. */
  paidAtDoor: boolean;
  delayed: boolean;
  /** Never picked up — stays at "Pickup requested". */
  stuckAtPickup?: boolean;
  /** Stuck in the warehouse — a slow delivery. */
  stuckInTransit?: boolean;
  /** Carries another order's reference (a hand merge). */
  ref?: string;
}

export interface Ad {
  id: string;
  adsetId: string;
  name: string;
  campaignId: string;
  /** Share of the campaign's spend. */
  share: number;
  /** Cost per purchase multiplier: >1 is worse. */
  quality: number;
  /** Extra frequency, for creatives people have seen too often. */
  fatigue: number;
}

export interface Campaign { id: string; name: string; dailyBudget: number; status: string; cpp: number; startDay: number }

// ------------------------------------------------------------------ Meta setup

export const CAMPAIGNS: Campaign[] = [
  { id: "910000000000000101", name: "VL_Broad_Prospecting", dailyBudget: 1830, status: "ACTIVE", cpp: 1, startDay: 100 },
  { id: "910000000000000102", name: "VL_Retargeting_Engaged", dailyBudget: 580, status: "ACTIVE", cpp: 0.8, startDay: 100 },
  { id: "910000000000000103", name: "VL_Lookalike_Buyers", dailyBudget: 910, status: "ACTIVE", cpp: 1.05, startDay: 60 },
  { id: "910000000000000104", name: "VL_Sales_AllEgypt", dailyBudget: 600, status: "ACTIVE", cpp: 1.2, startDay: 24 },
];

export const ADS: Ad[] = [
  { id: "920000000000000201", adsetId: "930000000000000301", campaignId: CAMPAIGNS[0].id, name: "Travel Duo — UGC try-on", share: 0.34, quality: 0.85, fatigue: 0 },
  { id: "920000000000000202", adsetId: "930000000000000301", campaignId: CAMPAIGNS[0].id, name: "Lip Kit — 6 shades swatch reel", share: 0.28, quality: 0.95, fatigue: 0.2 },
  { id: "920000000000000203", adsetId: "930000000000000302", campaignId: CAMPAIGNS[0].id, name: "Glow Serum — before/after", share: 0.22, quality: 1.15, fatigue: 0 },
  { id: "920000000000000204", adsetId: "930000000000000302", campaignId: CAMPAIGNS[0].id, name: "Golden Hour — static offer", share: 0.16, quality: 1.85, fatigue: 0 },
  { id: "920000000000000205", adsetId: "930000000000000303", campaignId: CAMPAIGNS[1].id, name: "Retarget — reviews carousel", share: 0.6, quality: 0.75, fatigue: 1.3 },
  { id: "920000000000000206", adsetId: "930000000000000303", campaignId: CAMPAIGNS[1].id, name: "Retarget — free delivery reminder", share: 0.4, quality: 0.9, fatigue: 0.9 },
  { id: "920000000000000207", adsetId: "930000000000000304", campaignId: CAMPAIGNS[2].id, name: "Bridal Glow Set — creator video", share: 0.55, quality: 1.0, fatigue: 0 },
  { id: "920000000000000208", adsetId: "930000000000000304", campaignId: CAMPAIGNS[2].id, name: "Mascara — 3-second hook", share: 0.45, quality: 1.1, fatigue: 0.1 },
  { id: "920000000000000209", adsetId: "930000000000000305", campaignId: CAMPAIGNS[3].id, name: "All Egypt — Travel Duo UGC", share: 1, quality: 1, fatigue: 0 },
];

// ------------------------------------------------------------------ time

const cairoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
export const cairoDay = (t: number | Date) => cairoFmt.format(new Date(t));

/** Midnight in Cairo for the given day string, as a timestamp. */
function cairoMidnight(day: string): number {
  // Cairo is UTC+2 or +3; find the offset by formatting noon UTC.
  const guess = Date.parse(`${day}T00:00:00Z`);
  const shown = new Date(guess).toLocaleString("en-US", { timeZone: "Africa/Cairo", hour12: false, hour: "2-digit" });
  const offset = Number(shown) % 24; // hours ahead of UTC at midnight UTC
  return guess - offset * HOUR;
}

// ------------------------------------------------------------------ build

export interface World {
  builtFor: string;
  anchor: number;
  orders: Order[];
  /** Meta purchases and spend per day, per ad. */
  adDays: Map<string, Map<string, AdDay>>;
  customers: Customer[];
  abandoned: Abandoned[];
  activities: Activity[];
}

export interface AdDay { spend: number; impressions: number; reach: number; clicks: number; atc: number; purchases: number; value: number }
export interface Abandoned { id: string; createdAt: number; customer: Customer; items: Array<{ title: string; quantity: number }>; total: number; completed: boolean }
export interface Activity { time: number; actor: string; objectId: string; objectName: string; type: string; label: string; extra: Record<string, unknown> }

let cache: World | null = null;

export function world(now = Date.now()): World {
  const day = cairoDay(now);
  if (cache?.builtFor === day) return cache;
  cache = build(day);
  return cache;
}

function phone(r: ReturnType<typeof rng>) {
  return `+2010${r.int(0, 2)}${String(r.int(1000000, 9999999))}`;
}

function build(today: string): World {
  const anchor = cairoMidnight(today) + DAY; // end of today
  const start = anchor - HISTORY_DAYS * DAY;
  const r = rng(`velora:${today}`);

  // A customer base where ~18% come back.
  const customers: Customer[] = [];
  const newCustomer = () => {
    const c: Customer = {
      id: `gid://shopify/Customer/${7000000 + customers.length}`,
      first: r.pick(FIRST),
      last: r.pick(LAST),
      phone: phone(r),
      city: r.weighted(CITIES),
    };
    customers.push(c);
    return c;
  };

  const orders: Order[] = [];
  const dailyOrders = new Map<string, number>();
  let n = 0;

  for (let d = 0; d < HISTORY_DAYS; d++) {
    const dayStart = start + d * DAY;
    const dayName = cairoDay(dayStart + 12 * HOUR);
    const weekday = new Date(dayStart + 12 * HOUR).getUTCDay();
    // Friday is quieter in Egypt, Saturday–Monday busier.
    const weekFactor = [1.05, 1.08, 1.0, 0.97, 0.98, 0.82, 1.1][weekday];
    const wave = 1 + 0.12 * Math.sin(d / 9);
    const count = Math.max(6, Math.round(17.5 * weekFactor * wave + (r.next() - 0.5) * 7));
    dailyOrders.set(dayName, count);

    for (let k = 0; k < count; k++) {
      // Evenings are busiest.
      const hour = r.weighted([[9, 2], [11, 4], [13, 5], [15, 6], [17, 7], [19, 9], [21, 10], [22, 8], [23, 5], [1, 2]] as const);
      const createdAt = dayStart + hour * HOUR + r.int(0, 59) * 60_000 + r.int(0, 59) * 1000;
      const customer = customers.length > 40 && r.chance(0.18) ? r.pick(customers) : newCustomer();

      const itemCount = r.weighted([[1, 55], [2, 33], [3, 12]] as const);
      const items: LineItem[] = [];
      for (let i = 0; i < itemCount; i++) {
        const p = r.weighted(PRODUCTS.map((x) => [x, x.weight] as const));
        if (items.some((it) => it.title === p.title)) continue;
        items.push({ title: p.title, quantity: r.chance(0.12) ? 2 : 1, price: p.price, unfulfilled: 0 });
      }
      const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const shipping = subtotal >= 1500 ? 0 : 65;
      const discount = r.chance(0.22) ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal + shipping - discount;
      const payment: Payment = r.weighted([["cod", 78], ["card", 13], ["instapay", 9]] as const);
      const pending = payment === "instapay" && r.chance(0.06);

      const order: Order = {
        index: n,
        name: `${BRAND.prefix}${4100 + n}`,
        createdAt,
        customer,
        items,
        shipping,
        discount,
        total,
        payment,
        pending,
        cancelledAt: r.chance(0.035) ? createdAt + r.int(1, 10) * HOUR : null,
        landingPage: `https://velora-demo.com${r.weighted(LANDING)}`,
        plan: null,
      };

      if (!order.cancelledAt) {
        const risk = (CITY_RISK[customer.city] ?? 1.15) * (payment === "cod" ? 1.08 : 0.5);
        const failP = 0.112 * risk;
        const outcome: Outcome = r.chance(failP)
          ? r.weighted([["refused", 40], ["no_answer", 30], ["postponed", 8], ["whatsapp_cancel", 14], ["bosta_cancel", 8]] as const)
          : "delivered";
        const paidOnline = payment === "card" || (payment === "instapay" && !pending);
        order.plan = {
          tracking: String(52000000 + n * 37 + r.int(0, 30)),
          createdAfterH: r.int(1, 8) + r.next(),
          pickupAfterH: r.int(10, 20) + r.next(),
          attemptAfterH: r.int(34, 62) + r.next() * 4,
          outcome,
          cod: paidOnline ? 0 : total,
          paidAtDoor: payment === "cod" && r.chance(0.03),
          delayed: r.chance(0.04),
        };
        if (order.plan.paidAtDoor) order.plan.cod = 0;
      }
      orders.push(order);
      n++;
    }
  }

  orders.sort((a, b) => a.createdAt - b.createdAt);
  orders.forEach((o, i) => {
    o.index = i;
    o.name = `${BRAND.prefix}${4100 + i}`;
  });

  injectScenarios(orders, anchor, r);

  return {
    builtFor: today,
    anchor,
    orders,
    adDays: buildAds(start, dailyOrders, r),
    customers,
    abandoned: buildAbandoned(anchor, customers, r),
    activities: buildActivities(anchor, r),
  };
}

// ------------------------------------------------------------------ scenarios

/**
 * Guarantees every problem the dashboard can catch is on screen, by shaping a
 * few orders from the last five days. Times are relative to the end of today,
 * and only orders already placed by "now" are shown, so each scenario is set
 * on an order that is old enough for its rule to fire.
 */
function injectScenarios(orders: Order[], anchor: number, r: ReturnType<typeof rng>) {
  const now = Date.now();
  const ageH = (o: Order) => (now - o.createdAt) / HOUR;
  const used = new Set<number>();
  const take = (minH: number, maxH: number, filter: (o: Order) => boolean = () => true) => {
    const list = orders.filter((o) => !used.has(o.index) && ageH(o) >= minH && ageH(o) <= maxH && !o.cancelledAt && o.plan && filter(o));
    const o = list[Math.floor(r.next() * list.length)];
    if (o) used.add(o.index);
    return o;
  };
  const plan = (o: Order, patch: Partial<ParcelPlan>) => {
    o.plan = { ...(o.plan as ParcelPlan), ...patch };
  };
  const toCod = (o: Order) => {
    o.payment = "cod";
    o.pending = false;
    plan(o, { cod: o.total, paidAtDoor: false, outcome: "delivered" });
  };

  // Cancelled in Shopify, waybill still waiting for pickup.
  const a = take(6, 30);
  if (a) {
    toCod(a);
    a.cancelledAt = a.createdAt + 3 * HOUR;
    plan(a, { stuckAtPickup: true, createdAfterH: 1 });
  }

  // A customer ordered twice: the first was cancelled but its parcel is on the
  // road, the second has no waybill — a hand merge.
  const b = take(30, 80);
  if (b) {
    toCod(b);
    b.cancelledAt = b.createdAt + 40 * 60_000;
    plan(b, { attemptAfterH: 200, stuckInTransit: false });
    const twin: Order = {
      ...b,
      index: orders.length,
      name: `${BRAND.prefix}${4100 + orders.length}`,
      createdAt: b.createdAt + 25 * 60_000,
      cancelledAt: null,
      items: b.items.map((it) => ({ ...it })),
      plan: null,
    };
    used.add(twin.index);
    orders.push(twin);
  }

  // Part of the order isn't on the waybill.
  const c = take(28, 90, (o) => o.items.length >= 2);
  if (c) {
    toCod(c);
    c.items[c.items.length - 1].unfulfilled = c.items[c.items.length - 1].quantity;
    const missing = c.items[c.items.length - 1].price * c.items[c.items.length - 1].quantity;
    plan(c, { cod: c.total - missing, attemptAfterH: 150 });
  }

  // Not sent to Bosta at all.
  const d = take(26, 60);
  if (d) d.plan = null;

  // COD on the waybill doesn't match the order.
  const e = take(10, 40);
  if (e) {
    toCod(e);
    plan(e, { cod: e.total - 150, attemptAfterH: 120 });
  }

  // Paid by card, but the waybill still collects cash.
  const f = take(8, 40);
  if (f) {
    f.payment = "card";
    plan(f, { cod: f.total, attemptAfterH: 120, outcome: "delivered" });
  }

  // Prepaid order refused and coming back.
  const g = take(14, 100);
  if (g) {
    g.payment = "card";
    g.pending = false;
    plan(g, { cod: 0, outcome: "whatsapp_cancel", attemptAfterH: 200, createdAfterH: 2 });
  }

  // Instapay pending, Bosta will collect cash.
  const h = take(6, 40);
  if (h) {
    h.payment = "instapay";
    h.pending = true;
    plan(h, { cod: h.total, outcome: "delivered", attemptAfterH: 120 });
  }

  // Instapay pending and nothing to collect: ships unpaid.
  const i = take(6, 40);
  if (i) {
    i.payment = "instapay";
    i.pending = true;
    plan(i, { cod: 0, outcome: "delivered", attemptAfterH: 120 });
  }

  // Bosta hasn't picked it up after a day.
  const j = take(28, 60);
  if (j) {
    toCod(j);
    plan(j, { stuckAtPickup: true });
  }

  // Slow: still in the warehouse after three days.
  for (const k of [take(76, 110), take(80, 118)]) {
    if (!k) continue;
    toCod(k);
    plan(k, { stuckInTransit: true, delayed: true });
  }

  // Customer-facing failures in the last few days.
  const outcomes: Outcome[] = ["whatsapp_cancel", "bosta_cancel", "refused", "no_answer", "postponed", "no_answer", "refused"];
  for (const outcome of outcomes) {
    const o = take(outcome.endsWith("cancel") ? 14 : 50, 110);
    if (!o) continue;
    toCod(o);
    plan(o, { outcome, attemptAfterH: outcome.endsWith("cancel") ? 200 : r.int(36, 46) });
  }

  // An older order whose second attempt failed this week.
  const old = orders.find((o) => !used.has(o.index) && ageH(o) > 8 * 24 && ageH(o) < 10 * 24 && o.plan && !o.cancelledAt);
  if (old) {
    used.add(old.index);
    toCod(old);
    plan(old, { outcome: "no_answer", attemptAfterH: ageH(old) - 60 });
  }

  // A COD order paid by card at the door — looks like a gap, but isn't.
  const p = take(10, 60);
  if (p) {
    toCod(p);
    plan(p, { cod: 0, paidAtDoor: true });
  }

  void anchor;
}

// ------------------------------------------------------------------ Meta

function buildAds(start: number, dailyOrders: Map<string, number>, r: ReturnType<typeof rng>) {
  const out = new Map<string, Map<string, AdDay>>();
  for (let d = 0; d < HISTORY_DAYS; d++) {
    const day = cairoDay(start + d * DAY + 12 * HOUR);
    const daysAgo = HISTORY_DAYS - 1 - d;
    const orders = dailyOrders.get(day) ?? 15;
    // Spend creeps up over the last two weeks while orders stay flat, so cost
    // per purchase rises — the kind of drift the dashboard is there to catch.
    const ramp = daysAgo < 14 ? 1 + 0.2 * ((14 - daysAgo) / 14) : 1;
    const live = CAMPAIGNS.filter((c) => daysAgo < c.startDay);
    const metaPurchases = orders * 1.06 * (daysAgo < 14 ? 0.94 : 1);

    // Weight each ad by spend ÷ its cost, so better ads win more purchases.
    const rows: Array<{ ad: Ad; spend: number; pull: number }> = [];
    // Total daily spend stays around EGP 3,900 however many campaigns are live.
    const scale = 3900 / live.reduce((sum, c) => sum + c.dailyBudget, 0);
    for (const c of live) {
      const budget = c.dailyBudget * scale * ramp * (0.9 + r.next() * 0.2);
      for (const ad of ADS.filter((a) => a.campaignId === c.id)) {
        const spend = budget * ad.share;
        rows.push({ ad, spend, pull: spend / (c.cpp * ad.quality) });
      }
    }
    const pullTotal = rows.reduce((s, x) => s + x.pull, 0);
    const map = new Map<string, AdDay>();
    for (const { ad, spend, pull } of rows) {
      const purchases = Math.round((metaPurchases * pull) / pullTotal + (r.next() - 0.5) * 0.8);
      const cpm = 95 + r.next() * 45;
      const impressions = Math.round((spend / cpm) * 1000);
      const freq = 1.25 + ad.fatigue * (1 + (60 - Math.min(daysAgo, 60)) / 60) + r.next() * 0.15;
      const clicks = Math.round(impressions * (0.011 + r.next() * 0.009) / Math.max(ad.quality, 0.6));
      map.set(ad.id, {
        spend: Math.round(spend * 100) / 100,
        impressions,
        reach: Math.round(impressions / freq),
        clicks,
        atc: Math.round(clicks * (0.07 + r.next() * 0.04)),
        purchases: Math.max(0, purchases),
        value: Math.max(0, purchases) * (1150 + r.int(-120, 160)),
      });
    }
    out.set(day, map);
  }
  return out;
}

function buildAbandoned(anchor: number, customers: Customer[], r: ReturnType<typeof rng>): Abandoned[] {
  const list: Abandoned[] = [];
  for (let d = 0; d < 21; d++) {
    const count = r.int(3, 7);
    for (let k = 0; k < count; k++) {
      const createdAt = anchor - (d + 1) * DAY + r.int(9, 23) * HOUR + r.int(0, 59) * 60_000;
      const p = r.weighted(PRODUCTS.map((x) => [x, x.weight] as const));
      const quantity = r.chance(0.15) ? 2 : 1;
      list.push({
        id: `gid://shopify/AbandonedCheckout/${880000 + list.length}`,
        createdAt,
        customer: r.chance(0.3) ? r.pick(customers) : { id: "", first: r.pick(FIRST), last: r.pick(LAST), phone: phone(r), city: r.weighted(CITIES) },
        items: [{ title: p.title, quantity }],
        total: p.price * quantity + 65,
        completed: false,
      });
    }
  }
  return list;
}

function buildActivities(anchor: number, r: ReturnType<typeof rng>): Activity[] {
  const at = (daysAgo: number) => anchor - (daysAgo + 1) * DAY + r.int(10, 20) * HOUR;
  return [
    { time: at(12), actor: "Media buyer", objectId: CAMPAIGNS[0].id, objectName: CAMPAIGNS[0].name, type: "update_campaign_budget", label: "Campaign budget updated", extra: { old_value: 180000, new_value: 220000 } },
    { time: at(9), actor: "Media buyer", objectId: ADS[3].id, objectName: ADS[3].name, type: "update_ad_run_status", label: "Ad status updated", extra: { old_value: "Paused", new_value: "Active" } },
    { time: at(6), actor: "Media buyer", objectId: CAMPAIGNS[2].id, objectName: CAMPAIGNS[2].name, type: "update_campaign_budget", label: "Campaign budget updated", extra: { old_value: 90000, new_value: 110000 } },
    { time: at(3), actor: "Media buyer", objectId: CAMPAIGNS[1].id, objectName: CAMPAIGNS[1].name, type: "update_campaign_name", label: "Campaign name updated", extra: {} },
    { time: at(1), actor: "Media buyer", objectId: ADS[2].id, objectName: ADS[2].name, type: "update_ad_run_status", label: "Ad status updated", extra: { old_value: "Active", new_value: "Active" } },
  ];
}

// ------------------------------------------------------------------ parcels

export const STATE = {
  pickupRequested: { code: 10, value: "Pickup requested" },
  pickedUp: { code: 21, value: "Picked up" },
  warehouse: { code: 24, value: "Received at warehouse" },
  outForDelivery: { code: 41, value: "Out for delivery" },
  delivered: { code: 45, value: "Delivered" },
  returned: { code: 46, value: "Returned to business" },
  exception: { code: 47, value: "Exception" },
  terminated: { code: 48, value: "Terminated" },
};

const REASONS: Record<"refused" | "no_answer" | "postponed", string[]> = {
  refused: ["Cancellation - Customer refuses to receive the order", "Cancellation - Customer wants to open the package first", "Customer refused - product issue"],
  no_answer: ["Retry delivery - Customer is not answering", "Retry delivery - Customer's phone is off", "Retry delivery - Customer not in the address"],
  postponed: ["Postponed - Customer postponed the delivery to another day"],
};

export interface ParcelView {
  trackingNumber: string;
  businessReference: string;
  cod: number;
  type: { value: string };
  state: { value: string; code: number; exception?: Array<{ reason: string; time: string; attemptType: string }>; canceled?: { time: string } };
  receiver: { fullName: string; phone: string };
  dropOffAddress: { city: { name: string } };
  attemptsCount: number;
  createdAt: string;
  updatedAt: string;
  isDelayed: boolean;
}

/** What Bosta would show for this order's parcel right now, or null if none yet. */
export function parcelOf(order: Order, now: number): ParcelView | null {
  const p = order.plan;
  if (!p) return null;
  const t0 = order.createdAt;
  const created = t0 + p.createdAfterH * HOUR;
  if (now < created) return null;
  const at = (h: number) => t0 + h * HOUR;
  const iso = (t: number) => new Date(t).toISOString();
  const r = rng(`reason:${order.name}`);

  let state: ParcelView["state"] = { ...STATE.pickupRequested };
  let updated = created;
  const exceptions: Array<{ reason: string; time: string; attemptType: string }> = [];

  if (p.outcome === "whatsapp_cancel" || p.outcome === "bosta_cancel") {
    const cancelAt = created + 2.5 * HOUR;
    if (now >= cancelAt) {
      state = { ...(now >= cancelAt + 4 * DAY ? STATE.returned : STATE.terminated), canceled: { time: iso(cancelAt) } };
      updated = cancelAt;
    }
  } else if (!p.stuckAtPickup && now >= at(p.pickupAfterH)) {
    state = { ...STATE.pickedUp };
    updated = at(p.pickupAfterH);
    if (now >= at(p.pickupAfterH + 5)) {
      state = { ...STATE.warehouse };
      updated = at(p.pickupAfterH + 5);
    }
    if (!p.stuckInTransit && now >= at(p.attemptAfterH - 6)) {
      state = { ...STATE.outForDelivery };
      updated = at(p.attemptAfterH - 6);
    }
    if (!p.stuckInTransit && now >= at(p.attemptAfterH)) {
      if (p.outcome === "delivered" || p.outcome === "postponed") {
        if (p.outcome === "postponed") {
          exceptions.push({ reason: REASONS.postponed[0], time: iso(at(p.attemptAfterH)), attemptType: "delivery" });
          state = { ...STATE.exception };
          updated = at(p.attemptAfterH);
        }
        const deliverAt = p.outcome === "postponed" ? at(p.attemptAfterH + 72) : at(p.attemptAfterH);
        if (now >= deliverAt) {
          state = { ...STATE.delivered };
          updated = deliverAt;
        }
      } else {
        const reasons = REASONS[p.outcome];
        exceptions.push({ reason: r.pick(reasons), time: iso(at(p.attemptAfterH)), attemptType: "delivery" });
        state = { ...STATE.exception };
        updated = at(p.attemptAfterH);
        if (now >= at(p.attemptAfterH + 24)) {
          exceptions.push({ reason: r.pick(reasons), time: iso(at(p.attemptAfterH + 24)), attemptType: "delivery" });
          updated = at(p.attemptAfterH + 24);
        }
        if (now >= at(p.attemptAfterH + 96)) {
          state = { ...STATE.returned };
          updated = at(p.attemptAfterH + 96);
        }
      }
    }
  }

  if (exceptions.length) state.exception = exceptions;
  return {
    trackingNumber: p.tracking,
    businessReference: `Velora:${p.ref ?? order.name}`,
    cod: p.cod,
    type: { value: "Send" },
    state,
    receiver: { fullName: `${order.customer.first} ${order.customer.last}`, phone: order.customer.phone },
    dropOffAddress: { city: { name: order.customer.city } },
    attemptsCount: exceptions.length + (state.code === 45 ? 1 : 0),
    createdAt: iso(created),
    updatedAt: iso(updated),
    isDelayed: p.delayed && state.code < 45,
  };
}
