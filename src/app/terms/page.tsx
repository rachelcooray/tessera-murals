import type { Metadata } from "next";
import { Terms } from "@/components/legal/Legal";

export const metadata: Metadata = { title: "Terms of sale and use" };

export default function Page() {
  return <Terms />;
}
