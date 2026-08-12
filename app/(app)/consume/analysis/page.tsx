import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AnalysisView } from "@/components/consume-analysis/analysis-view";
import { loadAnalysisData } from "@/components/consume-analysis/data";

export const dynamic = "force-dynamic";

export const metadata = { title: "Consumption & Forecasts — Kaviari Cellar" };

export default async function ConsumptionAnalysisPage() {
  const now = new Date();
  const data = await loadAnalysisData(now);

  return (
    <div>
      <Link
        href="/consume"
        className="mb-2 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Quick log
      </Link>
      <PageHeader
        title="Consumption & Forecasts"
        description="How the cellar is being consumed — weekly or monthly, in total or by caviar type — compared against everyone's forecasts."
      />
      <AnalysisView data={data} now={now.toISOString()} />
    </div>
  );
}
