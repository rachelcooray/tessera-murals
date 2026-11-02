import type { Metadata } from "next";
import { Suspense } from "react";
import { Challenge } from "@/components/mosaic/Artists";

export const metadata: Metadata = { title: "Colour challenge" };

export default function Page() {
  return <Suspense fallback={null}><Challenge /></Suspense>;
}
