import { redirect } from "next/navigation";

/** The analysis page moved up to /consume — keep old links working. */
export default function ConsumptionAnalysisPage() {
  redirect("/consume");
}
