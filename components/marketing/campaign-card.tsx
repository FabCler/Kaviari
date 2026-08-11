"use client";

import { CalendarDays, ClipboardList, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_COLORS,
  CAMPAIGN_TYPE_LABELS,
  STATUS_BADGE_VARIANT,
  type CampaignView,
} from "@/components/marketing/types";

function excerpt(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function CampaignCard({
  campaign,
  currency,
  onEdit,
  onLogResults,
  onDelete,
}: {
  campaign: CampaignView;
  currency: string;
  onEdit: (c: CampaignView) => void;
  onLogResults: (c: CampaignView) => void;
  onDelete: (c: CampaignView) => void;
}) {
  const muted =
    campaign.status === "completed" || campaign.status === "cancelled";
  return (
    <Card className={muted ? "opacity-80" : undefined}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-2.5 shrink-0 rounded-full ${CAMPAIGN_TYPE_COLORS[campaign.type].dot}`}
          />
          <CardTitle className="min-w-0 truncate">{campaign.name}</CardTitle>
        </div>
        <CardDescription className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          <span className="tnum">
            {formatDate(campaign.startDate)}
            {campaign.endDate ? ` – ${formatDate(campaign.endDate)}` : ""}
          </span>
        </CardDescription>
        <CardAction className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${campaign.name}`}
            onClick={() => onEdit(campaign)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${campaign.name}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(campaign)}
          >
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="seafoam">{CAMPAIGN_TYPE_LABELS[campaign.type]}</Badge>
          <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>
            {CAMPAIGN_STATUS_LABELS[campaign.status]}
          </Badge>
          {campaign.budget != null ? (
            <Badge variant="outline" className="tnum">
              Budget {formatMoney(campaign.budget, currency)}
            </Badge>
          ) : null}
        </div>
        {campaign.productNames.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Products: </span>
            {campaign.productNames.join(", ")}
          </p>
        ) : null}
        {campaign.notes ? (
          <p className="text-sm text-muted-foreground">
            {excerpt(campaign.notes)}
          </p>
        ) : null}
        {campaign.results || campaign.resultRevenue != null ? (
          <div className="rounded-md border border-gold/30 bg-gold/5 p-3">
            <p className="text-xs font-medium tracking-wide text-gold-deep uppercase">
              Results
              {campaign.resultRevenue != null ? (
                <span className="tnum float-right">
                  {formatMoney(campaign.resultRevenue, currency)}
                </span>
              ) : null}
            </p>
            {campaign.results ? (
              <p className="mt-1 text-sm text-foreground">
                {excerpt(campaign.results, 200)}
              </p>
            ) : null}
          </div>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onLogResults(campaign)}
        >
          <ClipboardList aria-hidden />
          {campaign.results || campaign.resultRevenue != null
            ? "Update results"
            : "Log results"}
        </Button>
      </CardContent>
    </Card>
  );
}
