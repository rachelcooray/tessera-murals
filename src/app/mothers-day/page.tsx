import type { Metadata } from "next";
import { CampaignPage } from "@/components/mosaic/Campaign";
import { campaignById } from "@/config/campaigns";

export const metadata: Metadata = { title: "Mother's Day: made for Mum, by everyone", description: "Order by 14 February. One photo of Mum, a square from everyone, revealed on Mother's Day." };
export default function Page() { return <CampaignPage campaign={campaignById("mothers-day")} />; }
