import type { Metadata } from "next";
import { Suspense } from "react";
import { TileRoute } from "@/components/Routes";

export const metadata: Metadata = { title: "A tile on the wall", description: "One of 400 tiles on Tessera, a mural made by strangers." };

export default function Page() {
  return <Suspense fallback={null}><TileRoute /></Suspense>;
}
