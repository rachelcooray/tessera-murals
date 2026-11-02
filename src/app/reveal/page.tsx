import type { Metadata } from "next";
import { Suspense } from "react";
import { RevealRoute } from "@/components/mosaic/Reveal";

export const metadata: Metadata = { title: "The reveal" };

export default function Page() {
  return <Suspense fallback={null}><RevealRoute /></Suspense>;
}
