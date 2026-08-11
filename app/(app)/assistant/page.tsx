import { AI_UNAVAILABLE_MESSAGE, isAiConfigured } from "@/lib/ai";
import { PageHeader } from "@/components/page-header";
import { AssistantChat } from "@/components/assistant/chat";

export default function AssistantPage() {
  return (
    <div>
      <PageHeader
        title="Caviar Assistant"
        description="An AI copilot that knows your cellar — stock, orders, consumption and campaigns"
      />
      <AssistantChat
        aiConfigured={isAiConfigured()}
        aiUnavailableMessage={AI_UNAVAILABLE_MESSAGE}
      />
    </div>
  );
}
