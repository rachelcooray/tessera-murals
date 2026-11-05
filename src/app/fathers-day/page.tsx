import type { Metadata } from "next";
import { CampaignPage } from "@/components/mosaic/Campaign";
import { campaignById } from "@/config/campaigns";

export const metadata: Metadata = { title: "Father's Day: for Dad, from everyone", description: "Order by 30 May. One photo of Dad, a square from everyone, revealed on Father's Day." };
export default function Page() { return <CampaignPage campaign={campaignById("fathers-day")} />; }
