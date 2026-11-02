import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeRoute } from "@/components/Routes";

export const metadata: Metadata = { title: "Season 0 wall", description: "The first Tessera wall: 400 tiles, one per person." };

export default function Page() {
  return <Suspense fallback={<div className="stage" />}><HomeRoute /></Suspense>;
}
