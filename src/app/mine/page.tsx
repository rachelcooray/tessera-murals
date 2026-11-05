import type { Metadata } from "next";
import { Suspense } from "react";
import { MyMosaics } from "@/components/mosaic/Mine";

export const metadata: Metadata = { title: "My mosaics", robots: { index: false } };

export default function Page() {
  return <Suspense fallback={null}><MyMosaics /></Suspense>;
}
