"use client";

import * as React from "react";
import { RotateCcw, Send, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MiniMarkdown } from "@/components/assistant/markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTER_PROMPTS = [
  "What should I order next cycle?",
  "Which products are slow-moving?",
  "Summarize this month's consumption",
  "Draft an Instagram caption for the Kristal promotion",
];

export function AssistantChat({
  aiConfigured,
  aiUnavailableMessage,
}: {
  aiConfigured: boolean;
  aiUnavailableMessage: string;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const send = React.useCallback(
    async (history: ChatMessage[]) => {
      setThinking(true);
      setError(null);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Keep the payload within the API's 20-message cap.
          body: JSON.stringify({ messages: history.slice(-20) }),
        });
        const data = (await res.json().catch(() => null)) as {
          reply?: string;
          error?: string;
        } | null;
        if (!res.ok || !data?.reply) {
          throw new Error(data?.error ?? "The assistant request failed.");
        }
        setMessages([...history, { role: "assistant", content: data.reply }]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "The assistant request failed."
        );
      } finally {
        setThinking(false);
      }
    },
    []
  );

  function submit(text: string) {
    const content = text.trim();
    if (!content || thinking || !aiConfigured) return;
    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: content.slice(0, 4000) },
    ];
    setMessages(history);
    setInput("");
    void send(history);
  }

  function retry() {
    if (messages.length === 0) return;
    void send(messages);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-[24rem] flex-col rounded-lg border border-border bg-card shadow-sm">
      {!aiConfigured ? (
        <div className="p-4">
          <Alert variant="gold">
            <Sparkles aria-hidden />
            <AlertTitle>AI is not configured</AlertTitle>
            <AlertDescription>{aiUnavailableMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
        aria-live="polite"
      >
        {messages.length === 0 && !thinking ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-navy text-gold">
              <Sparkles className="size-6" aria-hidden />
            </div>
            <div>
              <p className="font-display text-lg text-foreground">
                Ask the Caviar Assistant
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                It knows your stock, orders, consumption and campaigns — ask it
                anything about the cellar.
              </p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => submit(p)}
                  disabled={!aiConfigured}
                  className="rounded-full border border-border bg-pearl px-3.5 py-1.5 text-sm text-foreground transition-colors hover:border-gold/60 hover:bg-champagne disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-pearl sm:max-w-[75%]">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-pearl px-4 py-2.5 text-foreground sm:max-w-[85%]">
                    <MiniMarkdown text={m.content} />
                  </div>
                </div>
              )
            )}
            {thinking ? (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-border bg-pearl px-4 py-3"
                  aria-label="Assistant is thinking"
                >
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="size-1.5 animate-bounce rounded-full bg-gold-deep"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-2.5 sm:max-w-[85%]">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={retry}
                    disabled={thinking}
                  >
                    <RotateCcw aria-hidden /> Retry
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message the assistant
        </label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder={
            aiConfigured
              ? "Ask about stock, orders, campaigns…"
              : "AI is not configured"
          }
          disabled={!aiConfigured || thinking}
          className="max-h-32 min-h-9 flex-1 resize-none rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button
          type="submit"
          variant="gold"
          size="icon"
          aria-label="Send message"
          disabled={!aiConfigured || thinking || !input.trim()}
        >
          <Send />
        </Button>
      </form>
    </div>
  );
}
