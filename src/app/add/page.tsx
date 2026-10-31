import type { Metadata } from "next";
import { Suspense } from "react";
import { AddFlow } from "@/components/AddFlow";

export const metadata: Metadata = { title: "Add your tile" };

async function Add({ searchParams }: { searchParams: PageProps<"/add">["searchParams"] }) {
  const q = await searchParams;
  const m = typeof q.spot === "string" ? q.spot.match(/^(\d+),(\d+)$/) : null;
  return <AddFlow preferSpot={m ? { x: Number(m[1]), y: Number(m[2]) } : null} startGift={q.gift === "1"} />;
}

export default function Page(props: PageProps<"/add">) {
  return <Suspense fallback={null}><Add searchParams={props.searchParams} /></Suspense>;
}
