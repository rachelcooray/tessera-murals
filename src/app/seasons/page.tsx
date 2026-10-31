import type { Metadata } from "next";
import { SeasonsView } from "@/components/Pages";

export const metadata: Metadata = { title: "Past seasons" };
export default function Page() { return <SeasonsView />; }
