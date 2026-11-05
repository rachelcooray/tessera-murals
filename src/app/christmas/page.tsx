import type { Metadata } from "next";
import { CampaignPage } from "@/components/mosaic/Campaign";
import { campaignById } from "@/config/campaigns";

export const metadata: Metadata = { title: "Christmas", description: " a gift the whole family paints:Order by 4 December. One family photo, a square from everyone, revealed on Christmas morning." };
export default function Page() { return <CampaignPage campaign={campaignById("christmas")} />; }
