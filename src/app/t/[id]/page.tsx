import type { Metadata } from "next";
import { Suspense } from "react";
import { TileView } from "@/components/Pages";
import { seedData } from "@/lib/seed";

export async function generateMetadata(props: PageProps<"/t/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = seedData().tiles.find((x) => x.id === id);
  const who = t ? t.displayName ?? "Anonymous" : "A tile";
  return { title: `${who} on the wall`, description: t?.phrase ? `“${t.phrase}” · one of 400 tiles on Tessera` : "One of 400 tiles on Tessera, a mural made by strangers." };
}

async function Tile({ params, searchParams }: Pick<PageProps<"/t/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const q = await searchParams;
  return <TileView id={id} gift={q.gift === "1"} />;
}

export default function Page(props: PageProps<"/t/[id]">) {
  return <Suspense fallback={null}><Tile params={props.params} searchParams={props.searchParams} /></Suspense>;
}
