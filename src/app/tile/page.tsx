import type { Metadata } from "next";
import { Suspense } from "react";
import { TileRouteMosaic } from "@/components/mosaic/TilePage";

export const metadata: Metadata = { title: "A tile in the mosaic" };

export default function Page() {
  return <Suspense fallback={null}><TileRouteMosaic /></Suspense>;
}
