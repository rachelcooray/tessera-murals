import type { Metadata } from "next";
import { Suspense } from "react";
import { FoundingList } from "@/components/mosaic/FoundingList";

export const metadata: Metadata = { title: "Join the founding list", description: "Hear first when founding mosaics open: your photo, painted square by square by the people who love you." };

export default function Page() {
  return <Suspense fallback={null}><FoundingList /></Suspense>;
}
