import type { Metadata } from "next";
import { CampaignPage } from "@/components/mosaic/Campaign";
import { campaignById } from "@/config/campaigns";

export const metadata: Metadata = { title: "Anniversaries: painted by everyone they love", description: "One photo, a square from the children, grandchildren and old friends, revealed on the anniversary." };
export default function Page() { return <CampaignPage campaign={campaignById("anniversaries")} />; }
