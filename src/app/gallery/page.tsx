import type { Metadata } from "next";
import { Suspense } from "react";
import { Gallery } from "@/components/mosaic/Artists";

export const metadata: Metadata = { title: "Past mosaics" };

export default function Page() {
  return <Suspense fallback={null}><Gallery /></Suspense>;
}
