import type { Metadata } from "next";
import { AdminView } from "@/components/Pages";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export default function Page() { return <AdminView />; }
