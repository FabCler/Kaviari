import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { AI_UNAVAILABLE_MESSAGE, isAiConfigured } from "@/lib/ai";
import { PageHeader } from "@/components/page-header";
import { AssistantView } from "@/components/assistant/assistant-view";
import type { ChatSessionSummary } from "@/components/assistant/types";

export default async function AssistantPage() {
  // The (app) layout redirects unauthenticated visitors; this keeps types safe.
  const user = await getCurrentUser();

  const sessionRecords = user
    ? await prisma.chatSession.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { messages: true } } },
      })
    : [];

  const sessions: ChatSessionSummary[] = sessionRecords.map((s) => ({
    id: s.id,
    title: s.title,
    updatedAt: s.updatedAt.toISOString(),
    messageCount: s._count.messages,
  }));

  return (
    <div>
      <PageHeader
        title="Caviar Assistant"
        description="An AI copilot that knows your cellar — stock, orders, consumption and campaigns"
      />
      <AssistantView
        initialSessions={sessions}
        aiConfigured={isAiConfigured()}
        aiUnavailableMessage={AI_UNAVAILABLE_MESSAGE}
      />
    </div>
  );
}
