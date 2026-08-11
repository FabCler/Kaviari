"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_COLORS,
  CAMPAIGN_TYPE_LABELS,
  STATUS_BADGE_VARIANT,
  type CampaignView,
} from "@/components/marketing/types";
import type { CampaignType } from "@/lib/domain";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function campaignCoversDay(campaign: CampaignView, day: Date): boolean {
  const start = startOfDay(new Date(campaign.startDate));
  const end = startOfDay(
    new Date(campaign.endDate ?? campaign.startDate)
  );
  const d = startOfDay(day);
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function isMuted(campaign: CampaignView): boolean {
  return campaign.status === "completed" || campaign.status === "cancelled";
}

export function CampaignCalendar({
  campaigns,
  month,
  onSelect,
}: {
  campaigns: CampaignView[];
  /** "YYYY-MM" from the page's searchParams. */
  month: string;
  onSelect: (campaign: CampaignView) => void;
}) {
  const router = useRouter();
  const monthDate = React.useMemo(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    return m
      ? new Date(Number(m[1]), Number(m[2]) - 1, 1)
      : startOfMonth(new Date());
  }, [month]);

  const days = React.useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }),
      }),
    [monthDate]
  );

  const today = new Date();

  const monthCampaigns = React.useMemo(() => {
    const gridStart = days[0];
    const gridEnd = days[days.length - 1];
    return campaigns
      .filter((c) => {
        const start = startOfDay(new Date(c.startDate));
        const end = startOfDay(new Date(c.endDate ?? c.startDate));
        return start <= gridEnd && end >= gridStart;
      })
      .sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
  }, [campaigns, days]);

  function go(next: Date) {
    router.push(`/marketing?month=${format(next, "yyyy-MM")}`, {
      scroll: false,
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-foreground">
          {format(monthDate, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => go(addMonths(monthDate, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(startOfMonth(new Date()))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => go(addMonths(monthDate, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border bg-muted/50">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-1 py-1.5 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:px-2 sm:text-xs"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = isSameMonth(day, monthDate);
            const isToday = isSameDay(day, today);
            const dayCampaigns = campaigns.filter((c) =>
              campaignCoversDay(c, day)
            );
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-14 border-b border-r border-border p-1 sm:min-h-24 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-muted/30"
                )}
              >
                <div
                  className={cn(
                    "tnum mb-1 flex size-6 items-center justify-center rounded-full text-xs",
                    inMonth ? "text-foreground" : "text-muted-foreground/60",
                    isToday && "bg-gold font-semibold text-caviar"
                  )}
                >
                  {format(day, "d")}
                </div>
                {/* Pills from sm up */}
                <div className="hidden space-y-0.5 sm:block">
                  {dayCampaigns.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelect(c)}
                      title={`${c.name} (${CAMPAIGN_TYPE_LABELS[c.type]})`}
                      className={cn(
                        "block w-full truncate rounded-sm px-1.5 py-0.5 text-left text-[11px] leading-tight font-medium transition-opacity hover:opacity-80",
                        CAMPAIGN_TYPE_COLORS[c.type].pill,
                        isMuted(c) && "opacity-40 hover:opacity-60"
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                  {dayCampaigns.length > 3 ? (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      +{dayCampaigns.length - 3} more
                    </p>
                  ) : null}
                </div>
                {/* Dots below sm */}
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {dayCampaigns.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelect(c)}
                      aria-label={c.name}
                      className={cn(
                        "size-1.5 rounded-full",
                        CAMPAIGN_TYPE_COLORS[c.type].dot,
                        isMuted(c) && "opacity-40"
                      )}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {(Object.keys(CAMPAIGN_TYPE_LABELS) as CampaignType[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                CAMPAIGN_TYPE_COLORS[t].dot
              )}
            />
            {CAMPAIGN_TYPE_LABELS[t]}
          </span>
        ))}
      </div>

      {/* Month campaign list (primary affordance on mobile, useful everywhere) */}
      <div className="mt-6 sm:hidden">
        <h3 className="mb-2 text-sm font-medium text-foreground">
          This month&apos;s campaigns
        </h3>
        {monthCampaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing planned this month.
          </p>
        ) : (
          <ul className="space-y-2">
            {monthCampaigns.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card p-3 text-left"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      CAMPAIGN_TYPE_COLORS[c.type].dot,
                      isMuted(c) && "opacity-40"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {c.name}
                    </span>
                    <span className="tnum block text-xs text-muted-foreground">
                      {formatDateShort(c.startDate)}
                      {c.endDate ? ` – ${formatDateShort(c.endDate)}` : ""}
                    </span>
                  </span>
                  <Badge variant={STATUS_BADGE_VARIANT[c.status]}>
                    {CAMPAIGN_STATUS_LABELS[c.status]}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
