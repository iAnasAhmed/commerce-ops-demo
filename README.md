# Commerce Ops: Meta Ads, Shopify and Bosta on one screen

A live demo of an operations dashboard for Shopify brands that sell with cash on delivery in Egypt. It runs on **Velora Cosmetics**, a made-up brand with generated orders, ads and customers at the size of a real brand doing about 15–20 orders a day.

- `/`: what it does, the order problems it catches, a daily routine, a value calculator and a "What would this be worth to you?" offer form.
- `/app`: the dashboard itself, with nine tabs.

## What it tracks

| Tab | Question it answers |
|---|---|
| Month so far | How did this month really go, after failed deliveries? |
| Live | Which ads should I pause, fix or scale today? |
| Insights | Where do buyers come from, and where does money leak? |
| Test | Is the A/B test winning on delivered orders? |
| Customers | Who is due to reorder, and who abandoned checkout? |
| Action Needed | Which failed deliveries should we call today? |
| Order Issues | Which orders don't match between Shopify and Bosta? |
| Instapay | Which bank transfers still need checking? |
| People | Who can see what? |

### Order issues it catches (15)

Cancelled order with an open waybill · cancelled order being delivered · items missing from the waybill · order not sent to Bosta · COD different from the order · card-paid order with cash to collect · prepaid order coming back · Instapay order with cash to collect · Instapay payment not confirmed · not picked up · slow delivery · customer cancelled on Bosta's WhatsApp · cancelled by Bosta · failed delivery attempt · two orders shipped on one waybill.

### Call list categories (6)

Cancelled on WhatsApp · cancelled by Bosta · refused · couldn't reach · postponed · other.

## How the demo works

The dashboard code is the real one. Only the network is replaced: every call to Meta, Shopify and Bosta goes through `src/demo/fake-api.ts`, which answers from the generated world in `src/demo/world.ts` and never reaches the real services. Because the checks are real, every alert and order issue on screen is produced by the same logic a live brand would use.

The world is rebuilt each day relative to "now", so the demo always has fresh orders, failed deliveries and open issues.

## Run locally

```bash
npm install
npx wrangler d1 execute velora-demo-db --local --file=d1/schema.sql
npx wrangler d1 execute velora-demo-db --local --file=d1/seed-demo.sql
npm run dev -- -p 5184
```

Open http://localhost:5184.

### Offer form

Offers are saved to the local D1 table `offers`:

```bash
npx wrangler d1 execute velora-demo-db --local --command "SELECT * FROM offers"
```

To also get an email for each offer, set `USESEND_URL`, `USESEND_API_KEY`, `OFFER_NOTIFY_TO` and `OFFER_FROM` in `.env.local` (see `.env.example`).

## Read-only by design

The dashboard never changes ads, orders or shipments. The only things it writes are your own notes (calls made, issues fixed, Instapay checks), the People list, cached snapshots and offers.
