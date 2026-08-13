import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UsersCard } from "@/components/settings/users-card";
import { getSettings } from "@/lib/settings";
import { nextOrderDate } from "@/lib/replenishment";
import { AI_MODEL, isAiConfigured } from "@/lib/ai";
import { isEmailConfigured } from "@/lib/email";
import { EmailCard } from "@/components/settings/email-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PolicyForm } from "@/components/settings/policy-form";
import { OrderCycleCard } from "@/components/settings/order-cycle-card";
import { SessionCard } from "@/components/settings/session-card";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") {
    redirect("/");
  }
  const settings = await getSettings();
  const aiConfigured = isAiConfigured();

  const next = settings.lastOrderDate
    ? nextOrderDate(
        new Date(settings.lastOrderDate),
        settings.reviewPeriodDays
      ).toISOString()
    : null;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Replenishment policy, order cycle and app configuration"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <UsersCard />
        </div>
        <div className="lg:col-span-2">
          <PolicyForm
            initial={{
              reviewPeriodDays: settings.reviewPeriodDays,
              leadTimeDays: settings.leadTimeDays,
              safetyStockDays: settings.safetyStockDays,
              aduWindowDays: settings.aduWindowDays,
              expiryAlertDays: settings.expiryAlertDays,
              currency: settings.currency,
            }}
          />
        </div>

        <OrderCycleCard
          lastOrderDate={settings.lastOrderDate}
          nextOrderDate={next}
          reviewPeriodDays={settings.reviewPeriodDays}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Sparkles className="size-4 text-gold-deep" aria-hidden /> AI
            </CardTitle>
            <CardDescription>
              Powers the Caviar Assistant, the marketing content studio and
              import analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {aiConfigured ? (
                <Badge variant="success">Configured</Badge>
              ) : (
                <Badge variant="warning">Not configured</Badge>
              )}
              {aiConfigured ? (
                <span className="text-sm text-muted-foreground">
                  Model: <code className="font-mono text-xs">{AI_MODEL}</code>
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {aiConfigured
                ? "Set ANTHROPIC_MODEL to change the model. Remove ANTHROPIC_API_KEY to disable AI features."
                : "Set ANTHROPIC_API_KEY in your environment (and optionally ANTHROPIC_MODEL) to enable AI features. Everything else works without it."}
            </p>
          </CardContent>
        </Card>

        <EmailCard configured={isEmailConfigured()} />

        <SessionCard />
      </div>
    </div>
  );
}
