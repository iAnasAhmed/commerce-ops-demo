import Link from "next/link";

import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const metadata = { title: "Live demo — Velora Commerce Ops" };

export default function DashboardPage() {
  return (
    <>
      <div className="bg-foreground text-background">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-xs sm:px-6 sm:text-sm lg:px-8">
          <p>
            <span className="font-semibold">Live demo.</span> Velora is a made-up brand; every order and ad here is generated.
          </p>
          <div className="flex gap-4">
            <Link href="/" className="underline-offset-4 hover:underline">
              ← What it does
            </Link>
            <Link href="/#offer" className="font-semibold underline underline-offset-4">
              Make an offer
            </Link>
          </div>
        </div>
      </div>
      <main className="mx-auto w-full max-w-7xl px-4 pt-5 pb-32 sm:px-6 sm:pt-8 md:pb-8 lg:px-8">
        <DashboardClient />
      </main>
    </>
  );
}
