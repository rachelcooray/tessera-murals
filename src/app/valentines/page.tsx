import type { Metadata } from "next";
import { CampaignPage } from "@/components/mosaic/Campaign";
import { campaignById } from "@/config/campaigns";

export const metadata: Metadata = { title: "Valentine's Day", description: " a love letter from everyone:Order by 24 January. Friends and family each paint a square, revealed on 14 February." };
export default function Page() { return <CampaignPage campaign={campaignById("valentines")} />; }
