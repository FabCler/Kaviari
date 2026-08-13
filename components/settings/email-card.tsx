"use client";

import * as React from "react";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * SMTP status + one-click test send so the owner can verify that
 * access-request notifications actually reach their inbox.
 */
export function EmailCard({ configured }: { configured: boolean }) {
  const [sending, setSending] = React.useState(false);

  async function sendTest() {
    setSending(true);
    try {
      const res = await fetch("/api/settings/email-test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        to?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "The test email failed.", {
          duration: 10000,
        });
      } else {
        toast.success(
          `Test email sent to ${body.to} — check your inbox (and spam folder).`
        );
      }
    } catch {
      toast.error("Network error while sending the test email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Mail className="size-4 text-gold-deep" aria-hidden /> Email
        </CardTitle>
        <CardDescription>
          Notifies you by email when someone requests access to the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {configured ? (
            <Badge variant="success">Configured</Badge>
          ) : (
            <Badge variant="warning">Not configured</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {configured
            ? "SMTP is set up. Send yourself a test email to confirm deliveries reach your inbox."
            : "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally SMTP_FROM) in your environment to receive access-request emails. Until then, approve requests below in Users."}
        </p>
        {configured ? (
          <Button
            variant="outline"
            size="sm"
            onClick={sendTest}
            disabled={sending}
          >
            <Send className="size-4" />
            {sending ? "Sending…" : "Send me a test email"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
