import type { Metadata } from "next";
import { CampaignPage } from "@/components/mosaic/Campaign";
import { campaignById } from "@/config/campaigns";

export const metadata: Metadata = { title: "Leaving gifts: the card the whole office paints", description: "Everyone paints one square of a photo. Revealed on their last day." };
export default function Page() { return <CampaignPage campaign={campaignById("leaving-gifts")} />; }
