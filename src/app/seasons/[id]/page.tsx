import { MuralExperience } from "@/components/MuralExperience";
import { SEASONS } from "@/lib/seed";

export const dynamicParams = false;

export function generateStaticParams() {
  return SEASONS.map((s) => ({ id: s.id }));
}

export default async function SeasonPage(props: PageProps<"/seasons/[id]">) {
  const { id } = await props.params;
  return <MuralExperience seasonId={id} />;
}
