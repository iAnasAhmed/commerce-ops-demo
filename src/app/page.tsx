import { TourPage } from "@/components/tour/tour-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Commerce Ops — track ads, Shopify and Bosta in one place",
  description: "Meta Ads, Shopify and Bosta on one screen: real cost per delivered order, 15 order mistakes caught, and a call list for failed deliveries.",
  alternates: { languages: { ar: "/ar" } },
};

export default function Page() {
  return <TourPage lang="en" />;
}
