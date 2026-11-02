import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardRoute } from "@/components/mosaic/Dashboard";

export const metadata: Metadata = { title: "Your mosaic", robots: { index: false } };

export default function Page() {
  return <Suspense fallback={null}><DashboardRoute /></Suspense>;
}
