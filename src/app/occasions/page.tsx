import type { Metadata } from "next";
import { OccasionsPage } from "@/components/mosaic/Campaign";

export const metadata: Metadata = { title: "Occasions", description: "Christmas, weddings, Valentine's Day: one photo, a square from everyone, revealed together." };
export default function Page() { return <OccasionsPage />; }
