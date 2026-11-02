import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinRoute } from "@/components/mosaic/Join";

export const metadata: Metadata = { title: "Your slot", robots: { index: false } };

export default function Page() {
  return <Suspense fallback={null}><JoinRoute /></Suspense>;
}
