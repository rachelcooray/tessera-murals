import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderFlow } from "@/components/mosaic/Order";

export const metadata: Metadata = { title: "Start a mosaic" };

export default function Page() {
  return <Suspense fallback={null}><OrderFlow /></Suspense>;
}
