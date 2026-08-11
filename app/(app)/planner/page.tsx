import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { getPlannerData } from "@/lib/planner";
import { formatDate, shortProductName } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateDraftPoButton } from "@/components/planner/create-po-button";
import {
  PlannerTable,
  type PlannerRowDto,
} from "@/components/planner/planner-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Order Planner — Kaviari Cellar" };

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <div className="mt-1.5 text-sm">{children}</div>
      </CardContent>
    </Card>
  );
}

export default async function PlannerPage() {
  const planner = await getPlannerData();
  const { settings } = planner;

  const rows: PlannerRowDto[] = planner.rows.map((row) => ({
    productId: row.product.id,
    name: shortProductName(row.product.name),
    tinSizeGrams: row.product.tinSizeGrams,
    unitCost: row.product.unitCost,
    aduGramsPerDay: row.aduGramsPerDay,
    aduIsOverride: row.aduIsOverride,
    onHandTins: row.onHandTins,
    onHandGrams: row.onHandGrams,
    onOrderTins: row.onOrderTins,
    daysOfCover: row.daysOfCover,
    orderUpToGrams: row.suggestion.orderUpToGrams,
    suggestedGrams: row.suggestion.suggestedGrams,
    suggestedTins: row.suggestion.suggestedTins,
    lineValue: row.suggestion.suggestedTins * row.product.unitCost,
  }));

  const days = planner.daysUntilOrder;
  const countdown =
    days == null ? (
      <Badge variant="destructive">No order recorded — order now</Badge>
    ) : days < 0 ? (
      <Badge variant="destructive">
        Order overdue by {Math.abs(days)} {Math.abs(days) === 1 ? "day" : "days"}
      </Badge>
    ) : days === 0 ? (
      <Badge variant="warning">Order due today</Badge>
    ) : (
      <Badge variant="seafoam">
        Next order in {days} {days === 1 ? "day" : "days"}
      </Badge>
    );

  return (
    <div>
      <PageHeader
        title="Order Planner"
        description="Periodic-review replenishment: every review cycle, order each product back up to its order-up-to level."
        actions={<CreateDraftPoButton />}
      />

      {planner.orderDue ? (
        <Alert variant="gold" className="mb-6">
          <CalendarClock aria-hidden />
          <AlertTitle>An order is due</AlertTitle>
          <AlertDescription>
            <p>
              {planner.lastOrderDate
                ? `The last order was sent on ${formatDate(
                    planner.lastOrderDate
                  )} and the ${settings.reviewPeriodDays}-day review period has elapsed.`
                : "No previous order has been recorded, so the review cycle starts now."}{" "}
              Review the suggestions below and create a draft purchase order.
            </p>
            <CreateDraftPoButton size="sm" />
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Next order">
          <div className="flex flex-wrap items-center gap-2">
            {planner.nextOrderDate ? (
              <span className="font-medium tnum">
                {formatDate(planner.nextOrderDate)}
              </span>
            ) : null}
            {countdown}
          </div>
        </Stat>
        <Stat label="Last order">
          {planner.lastOrderDate ? (
            <span className="font-medium tnum">
              {formatDate(planner.lastOrderDate)}
            </span>
          ) : (
            <span className="text-muted-foreground">None recorded</span>
          )}
        </Stat>
        <Stat label="Policy">
          <Link href="/settings" className="hover:underline">
            <span className="tnum">
              Review {settings.reviewPeriodDays} d · Lead{" "}
              {settings.leadTimeDays} d · Safety {settings.safetyStockDays} d
            </span>
          </Link>
        </Stat>
        <Stat label="Open purchase orders">
          <Link href="/purchase-orders" className="font-medium hover:underline">
            <span className="tnum">{planner.openPoCount}</span>{" "}
            {planner.openPoCount === 1 ? "order" : "orders"} in the pipeline
          </Link>
        </Stat>
      </div>

      <Card className="py-2">
        <CardContent className="px-2 sm:px-4">
          <PlannerTable rows={rows} currency={settings.currency} />
        </CardContent>
      </Card>
    </div>
  );
}
