import type { Metadata } from "next";
import { Contact } from "@/components/legal/Legal";

export const metadata: Metadata = { title: "Contact" };

export default function Page() {
  return <Contact />;
}
