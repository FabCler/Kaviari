"use client";

import * as React from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { MessagesSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ChatPane } from "@/components/assistant/chat";
import { ReportDialog } from "@/components/assistant/report-dialog";
import type {
  ChatMessageView,
  ChatSessionSummary,
} from "@/components/assistant/types";

function relativeDate(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * Two-pane assistant: the user's chats on the left (sheet on mobile),
 * the conversation on the right. Chats persist per user via /api/chats.
 */
export function AssistantView({
  initialSessions,
  aiConfigured,
  aiUnavailableMessage,
}: {
  initialSessions: ChatSessionSummary[];
  aiConfigured: boolean;
  aiUnavailableMessage: string;
}) {
  const [sessions, setSessions] =
    React.useState<ChatSessionSummary[]>(initialSessions);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ChatSessionSummary | null>(
    null
  );
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const loadCounter = React.useRef(0);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  async function refreshSessions() {
    try {
      const res = await fetch("/api/chats");
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: ChatSessionSummary[] };
      if (data.sessions) setSessions(data.sessions);
    } catch {
      // Non-fatal — the list refreshes on the next action.
    }
  }

  async function request(text: string, sessionId: string | null) {
    setThinking(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = (await res.json().catch(() => null)) as {
        reply?: string;
        sessionId?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.reply || !data.sessionId) {
        throw new Error(data?.error ?? "The assistant request failed.");
      }
      const reply = data.reply;
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setActiveId(data.sessionId);
      setPendingRetry(null);
      void refreshSessions();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The assistant request failed."
      );
      setPendingRetry(text);
    } finally {
      setThinking(false);
    }
  }

  function send(text: string) {
    if (thinking || loadingMessages) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    void request(text, activeId);
  }

  function retry() {
    if (!pendingRetry || thinking) return;
    void request(pendingRetry, activeId);
  }

  async function selectChat(id: string) {
    if (thinking || id === activeId) {
      setMobileOpen(false);
      return;
    }
    const token = ++loadCounter.current;
    setActiveId(id);
    setMessages([]);
    setError(null);
    setPendingRetry(null);
    setLoadingMessages(true);
    setMobileOpen(false);
    try {
      const res = await fetch(`/api/chats/${id}`);
      if (!res.ok) throw new Error("Chat not found");
      const data = (await res.json()) as {
        messages: { role: "user" | "assistant"; content: string }[];
      };
      if (loadCounter.current !== token) return;
      setMessages(
        data.messages.map((m) => ({ role: m.role, content: m.content }))
      );
    } catch {
      if (loadCounter.current !== token) return;
      toast.error("Could not load that chat");
      setActiveId(null);
      void refreshSessions();
    } finally {
      if (loadCounter.current === token) setLoadingMessages(false);
    }
  }

  function newChat() {
    if (thinking) return;
    loadCounter.current++;
    setActiveId(null);
    setMessages([]);
    setError(null);
    setPendingRetry(null);
    setLoadingMessages(false);
    setMobileOpen(false);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/chats/${deleting.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Delete failed");
      }
      setSessions((list) => list.filter((s) => s.id !== deleting.id));
      if (activeId === deleting.id) newChat();
      toast.success("Chat deleted");
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  const chatList = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <Button
          variant="gold"
          size="sm"
          className="w-full"
          onClick={newChat}
          disabled={thinking}
        >
          <Plus aria-hidden /> New chat
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No chats yet — your conversations will appear here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((s) => {
              const active = s.id === activeId;
              return (
                <li key={s.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => void selectChat(s.id)}
                    className={cn(
                      "w-full rounded-md px-2.5 py-2 pr-9 text-left transition-colors",
                      active ? "bg-accent" : "hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "block truncate text-sm",
                        active
                          ? "font-medium text-accent-foreground"
                          : "text-foreground"
                      )}
                    >
                      {s.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {relativeDate(s.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete chat "${s.title}"`}
                    onClick={() => setDeleting(s)}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="flex h-[calc(100dvh-14rem)] min-h-[28rem] overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-pearl/40 md:flex">
          {chatList}
        </aside>

        {/* Chat column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            {/* Mobile chat list */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="md:hidden"
                  aria-label="Open chat list"
                >
                  <MessagesSquare aria-hidden /> Chats
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 gap-0 p-0">
                <SheetHeader className="border-b border-border">
                  <SheetTitle className="font-display">Your chats</SheetTitle>
                </SheetHeader>
                {chatList}
              </SheetContent>
            </Sheet>

            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {activeSession?.title ?? "New chat"}
            </p>

            <ReportDialog
              aiConfigured={aiConfigured}
              aiUnavailableMessage={aiUnavailableMessage}
            />
          </div>

          <ChatPane
            messages={messages}
            thinking={thinking}
            loading={loadingMessages}
            error={error}
            aiConfigured={aiConfigured}
            aiUnavailableMessage={aiUnavailableMessage}
            onSend={send}
            onRetry={retry}
          />
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Delete chat</DialogTitle>
            <DialogDescription>
              {deleting
                ? `"${deleting.title}" and its messages will be permanently removed.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
