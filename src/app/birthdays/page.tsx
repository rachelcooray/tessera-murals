import type { Metadata } from "next";
import { CampaignPage } from "@/components/mosaic/Campaign";
import { campaignById } from "@/config/campaigns";

export const metadata: Metadata = { title: "Big birthdays: everyone paints a square", description: "One photo, a square from everyone they know, revealed on their birthday." };
export default function Page() { return <CampaignPage campaign={campaignById("birthdays")} />; }
