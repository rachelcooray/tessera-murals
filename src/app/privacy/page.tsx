import type { Metadata } from "next";
import { Privacy } from "@/components/legal/Legal";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Page() {
  return <Privacy />;
}
