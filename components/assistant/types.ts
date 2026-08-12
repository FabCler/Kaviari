/** Shared client-side shapes for the Caviar Assistant. */

export interface ChatMessageView {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  /** ISO string at the server/client boundary. */
  updatedAt: string;
  messageCount: number;
}
