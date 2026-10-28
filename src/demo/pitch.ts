/**
 * Words for the tour page. Kept apart from the layout so the copy can be
 * edited without touching any markup.
 */

export const SOURCES = [
  {
    name: "Meta Ads",
    reads: "Spend, reach, clicks, add-to-carts and purchases per campaign, ad, platform and region, plus the account change log.",
    why: "Shows what each ad really costs per order, not only what Meta reports.",
  },
  {
    name: "Shopify",
    reads: "Orders, payments, cancellations, line items, customers, abandoned checkouts, stock and store sessions.",
    why: "The record of what was sold, to whom, and how they paid.",
  },
  {
    name: "Bosta",
    reads: "Every waybill: status, COD amount, delivery attempts, failure reasons and who cancelled it.",
    why: "What actually reached a customer, and where the cash really is.",
  },
] as const;

export const TABS = [
  {
    id: "month",
    name: "Month so far",
    shot: "/tour/month.png",
    line: "The monthly sales sheet, filled in for you.",
    points: [
      "Gross sales, discounts, shipping and net sales after failed deliveries",
      "Delivered, failed and still-open orders, day by day",
      "Pace for the month and comparison with last month",
      "Ad spend and cost per delivered order next to the sales",
    ],
  },
  {
    id: "live",
    name: "Live",
    shot: "/tour/live.png",
    line: "What to do about your ads today.",
    points: [
      "Real cost per purchase: Meta's number corrected for orders that never get delivered",
      "\"What needs a decision\": ads to pause, audiences that are tired, costs rising week on week",
      "Every campaign and ad with spend, cost per purchase, frequency and click rate",
      "Meta purchases next to Shopify orders and Bosta deliveries for each day",
    ],
  },
  {
    id: "insights",
    name: "Insights",
    shot: "/tour/insights.png",
    line: "Where the money comes from, and where it leaks.",
    points: [
      "Which landing pages, platforms and regions bring buyers",
      "Store funnel: sessions, add to cart, checkout, purchase",
      "Products running out of stock while their ads are still on",
      "A one-tap morning summary to paste into WhatsApp",
    ],
  },
  {
    id: "test",
    name: "Test",
    shot: "/tour/test.png",
    line: "A/B tests judged on delivered orders, not clicks.",
    points: [
      "Both test cells side by side: spend, orders, delivered, cost per order",
      "A decision rule agreed before the test starts",
      "Progress bar and decision date, so nobody calls it too early",
    ],
  },
  {
    id: "customers",
    name: "Customers",
    shot: "/tour/customers.png",
    line: "Sales you can win back this week.",
    points: [
      "Repeat buyers who are due to reorder, with what they bought last",
      "Abandoned checkouts with a ready WhatsApp message",
      "Mark who was messaged so two people never send the same note",
    ],
  },
  {
    id: "action-needed",
    name: "Action Needed",
    shot: "/tour/action-needed.png",
    line: "Your call team's list for failed deliveries.",
    points: [
      "Every failed or cancelled delivery, sorted by what to do",
      "Phone, COD amount, attempts and the courier's reason, in one row",
      "Notes saved per order: called, rescheduled, cancelled",
    ],
  },
  {
    id: "order-issues",
    name: "Order Issues",
    shot: "/tour/order-issues.png",
    line: "Mistakes between Shopify and Bosta, caught before they cost you.",
    points: [
      "Checks every recent order against its waybill",
      "Each problem says what is wrong and the exact fix",
      "Mark an issue as fixed and it leaves the list",
    ],
  },
  {
    id: "instapay",
    name: "Instapay",
    shot: "/tour/instapay.png",
    line: "Bank transfers checked before the parcel leaves.",
    points: [
      "Every Instapay order with its payment status",
      "Flags parcels that would collect cash for an order already paid",
      "Tick off transfers once you see them in the bank",
    ],
  },
  {
    id: "people",
    name: "People",
    shot: "/tour/people.png",
    line: "Each person sees only what they need.",
    points: [
      "Owner sees everything",
      "Client sees the month's results only",
      "Support sees calls, order issues, Instapay and customers, but never ad spend",
    ],
  },
] as const;

export type Severity = "Critical" | "Warning" | "Slow" | "Customer" | "Info";

export const ISSUES: Array<{ title: string; severity: Severity; example: string; saves: string }> = [
  {
    title: "Cancelled in Shopify, but the Bosta waybill is still open",
    severity: "Critical",
    example: "The customer re-ordered and the first order was cancelled, but its waybill is still waiting for pickup.",
    saves: "A second parcel shipped for nothing, plus its shipping and return fees.",
  },
  {
    title: "Cancelled in Shopify, but Bosta is delivering it",
    severity: "Critical",
    example: "The waybill is already out for delivery.",
    saves: "A parcel delivered with no order behind it.",
  },
  {
    title: "Part of the order isn't on the waybill",
    severity: "Critical",
    example: "Three items were ordered and only two were packed.",
    saves: "An angry customer and a second delivery fee.",
  },
  {
    title: "Not sent to Bosta",
    severity: "Critical",
    example: "Placed two days ago and still has no waybill.",
    saves: "A forgotten order and a lost customer.",
  },
  {
    title: "COD doesn't match the order",
    severity: "Critical",
    example: "Bosta will collect EGP 1,065 but the order total is EGP 1,215.",
    saves: "Cash that is short, found weeks later or never.",
  },
  {
    title: "Paid by card, but Bosta will collect cash",
    severity: "Critical",
    example: "Paid EGP 625 online; the waybill still asks for EGP 625 cash.",
    saves: "A customer charged twice, and the refund that follows.",
  },
  {
    title: "Prepaid order is coming back",
    severity: "Critical",
    example: "Paid by card, then cancelled at the door.",
    saves: "A refund that would otherwise be missed.",
  },
  {
    title: "Instapay order, but Bosta will collect cash",
    severity: "Warning",
    example: "The transfer is pending and the parcel still has COD.",
    saves: "Double payment, or a parcel released before the money arrives.",
  },
  {
    title: "Instapay payment not confirmed",
    severity: "Warning",
    example: "COD is set to 0, but no transfer has been seen.",
    saves: "A parcel handed over unpaid.",
  },
  {
    title: "Not picked up by Bosta",
    severity: "Warning",
    example: "The waybill was created yesterday and nobody came.",
    saves: "A day of delay the customer will blame you for.",
  },
  {
    title: "Not delivered after several days",
    severity: "Slow",
    example: "Six days in transit with no attempt.",
    saves: "A refusal at the door from a customer who waited too long.",
  },
  {
    title: "Customer cancelled on Bosta's WhatsApp confirmation",
    severity: "Customer",
    example: "Bosta's WhatsApp bot asked, and the customer said no.",
    saves: "A sale you can still rescue with one call.",
  },
  {
    title: "Cancelled by Bosta",
    severity: "Customer",
    example: "The courier closed the waybill.",
    saves: "An order that silently disappears.",
  },
  {
    title: "Delivery attempt failed",
    severity: "Customer",
    example: "Phone off, or the customer asked for another day.",
    saves: "The second attempt, if someone calls before it.",
  },
  {
    title: "Shipped on a cancelled order's waybill",
    severity: "Info",
    example: "Two orders were packed into one parcel by hand.",
    saves: "Confusion later when you check which order was paid.",
  },
];

export const CALL_TYPES = [
  { name: "Cancelled on WhatsApp", what: "The customer said no to Bosta's bot. Call to save the sale before the parcel goes back." },
  { name: "Cancelled by Bosta", what: "The courier closed it. Find out why and re-ship or refund." },
  { name: "Refused", what: "Refused at the door. Call to understand why: shade, price, or a change of mind." },
  { name: "Couldn't reach", what: "Phone off or no answer. One call or WhatsApp before the next attempt." },
  { name: "Postponed", what: "Asked for another day. Confirm the day so the next attempt succeeds." },
  { name: "Needs action", what: "Wrong address or any other reason. Fix it with the customer." },
] as const;

export const ROUTINE = [
  {
    when: "Every morning",
    time: "10 minutes",
    who: "Owner",
    steps: [
      "Open Live and read \"What needs a decision\". Pause or fix what it lists.",
      "Check the real cost per purchase against your ceiling.",
      "Copy the morning summary from Insights into your team group.",
    ],
  },
  {
    when: "Before noon",
    time: "20 minutes",
    who: "Support",
    steps: [
      "Open Order Issues and clear everything marked Critical before Bosta's pickup.",
      "Check Instapay: confirm transfers before those parcels leave.",
    ],
  },
  {
    when: "Afternoon",
    time: "30–60 minutes",
    who: "Support",
    steps: [
      "Work through Action Needed from top to bottom and save a note on each call.",
      "Send the reorder and abandoned-checkout messages from Customers.",
    ],
  },
  {
    when: "Every week",
    time: "15 minutes",
    who: "Owner",
    steps: [
      "Compare this week's cost per delivered order with last week's.",
      "Check the running test and wait for its decision date.",
      "Look at the regions and pages that bring buyers, and move budget there.",
    ],
  },
  {
    when: "End of month",
    time: "5 minutes",
    who: "Owner and client",
    steps: [
      "Open Month so far. Net sales already exclude failed deliveries, so this is the number to report.",
    ],
  },
] as const;

export const RULES = [
  "Judge ads on cost per delivered order, not on Meta's purchases.",
  "Wait for the minimum spend before you pause an ad. The dashboard says when an ad has spent enough to judge.",
  "Fix Critical order issues before the courier's pickup time, not after.",
  "Always save a note after a call, so nobody calls the same customer twice.",
  "Never edit an order or a waybill from the dashboard. It is read-only on purpose: fix it in Shopify or Bosta, then refresh.",
] as const;

export const FAQ = [
  {
    q: "Can it change my ads, orders or shipments?",
    a: "No. It only reads from Meta, Shopify and Bosta. The only things it saves are your own notes, such as who was called and which issue was fixed.",
  },
  {
    q: "Who can open it?",
    a: "Only the people you add, signed in with their Google account. Each role sees only its own tabs.",
  },
  {
    q: "We don't use Bosta. Will it work?",
    a: "This version is built for Bosta, Shopify and Meta. Another courier or store can be connected as part of your project.",
  },
  {
    q: "Is the data on this page real?",
    a: "No. Velora Cosmetics is a made-up brand. The orders, ads and customers are generated, at the size of a real Egyptian cosmetics brand doing about 15–20 orders a day. The checks that find problems are the real ones.",
  },
] as const;
