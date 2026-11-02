import type { Metadata } from "next";
import { Suspense } from "react";
import { MosaicAdmin } from "@/components/mosaic/Admin";

export const metadata: Metadata = { title: "Mosaics admin", robots: { index: false } };

export default function Page() {
  return <Suspense fallback={null}><MosaicAdmin /></Suspense>;
}
