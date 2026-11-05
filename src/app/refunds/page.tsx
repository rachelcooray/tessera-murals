import type { Metadata } from "next";
import { Refunds } from "@/components/legal/Legal";

export const metadata: Metadata = { title: "Refunds and cancellations" };

export default function Page() {
  return <Refunds />;
}
