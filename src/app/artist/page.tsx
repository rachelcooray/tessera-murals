import type { Metadata } from "next";
import { Suspense } from "react";
import { ArtistPage } from "@/components/mosaic/Artists";

export const metadata: Metadata = { title: "For artists" };

export default function Page() {
  return <Suspense fallback={null}><ArtistPage /></Suspense>;
}
