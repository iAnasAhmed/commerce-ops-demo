import { TourPage } from "@/components/tour/tour-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Commerce Ops — الإعلانات وشوبيفاي وبوسطة في شاشة واحدة",
  description: "إعلانات ميتا وشوبيفاي وبوسطة في شاشة واحدة: التكلفة الحقيقية لكل طلب مُسلَّم، 15 خطأ في الطلبات تُكتشف، وقائمة اتصال للتسليم الفاشل.",
  alternates: { languages: { en: "/" } },
};

export default function Page() {
  return <TourPage lang="ar" />;
}
