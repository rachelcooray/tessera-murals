import { Suspense } from "react";
import { MuralExperience } from "@/components/MuralExperience";

async function Season({ params }: { params: PageProps<"/seasons/[id]">["params"] }) {
  const { id } = await params;
  return <MuralExperience seasonId={id} />;
}

export default function Page(props: PageProps<"/seasons/[id]">) {
  return <Suspense fallback={<div className="stage" />}><Season params={props.params} /></Suspense>;
}
