import type { Metadata } from "next";
import { Suspense } from "react";
import { AddRoute } from "@/components/Routes";

export const metadata: Metadata = { title: "Add your tile" };

export default function Page() {
  return <Suspense fallback={null}><AddRoute /></Suspense>;
}
