import { Suspense } from "react";
import { MuralExperience } from "@/components/MuralExperience";

async function Home({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const q = await searchParams;
  return <MuralExperience flyToId={typeof q.tile === "string" ? q.tile : null} />;
}

export default function Page(props: PageProps<"/">) {
  return <Suspense fallback={<div className="stage" />}><Home searchParams={props.searchParams} /></Suspense>;
}
