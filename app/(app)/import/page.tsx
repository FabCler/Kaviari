import { AI_UNAVAILABLE_MESSAGE, isAiConfigured } from "@/lib/ai";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { ImportFlow } from "@/components/import/import-flow";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const settings = await getSettings();

  return (
    <div>
      <PageHeader
        title="Import & Analyze"
        description="Upload a supplier price list, stock take or sales export — the AI maps it to your catalog, you review, then it's written."
      />
      <div className="mx-auto max-w-3xl">
        <ImportFlow
          aiConfigured={isAiConfigured()}
          aiMessage={AI_UNAVAILABLE_MESSAGE}
          currency={settings.currency}
        />
      </div>
    </div>
  );
}
