import { Suspense } from "react";
import { HomeRoute } from "@/components/Routes";

export default function Page() {
  return <Suspense fallback={<div className="stage" />}><HomeRoute /></Suspense>;
}
