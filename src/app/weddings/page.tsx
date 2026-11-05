import type { Metadata } from "next";
import { CampaignPage } from "@/components/mosaic/Campaign";
import { campaignById } from "@/config/campaigns";

export const metadata: Metadata = { title: "Weddings", description: " the guest book every guest paints:Every guest paints one square of a photo you choose. Nobody sees it until the reveal." };
export default function Page() { return <CampaignPage campaign={campaignById("weddings")} />; }
