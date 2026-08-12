"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * "AI order recommendation" — asks the server to build a prioritized order
 * plan (order now / order soon / monitor) from stock, pipeline, policy and
 * forecasts. All quantities are validated and box-rounded server-side.
 */

type SectionKey = "order_now" | "order_soon" | "monitor";

interface AiOrderItem {
  prCode: string;
  name: string;
  units: number;
  boxes: number | null;
  reason: string;
}

interface AiOrderSection {
  key: SectionKey;
  title: string;
  items: AiOrderItem[];
}

interface AiOrderPlan {
  summary: string;
  sections: AiOrderSection[];
}

const SECTION_BADGE: Record<
  SectionKey,
  "destructive" | "warning" | "seafoam"
> = {
  order_now: "destructive",
  order_soon: "warning",
  monitor: "seafoam",
};

export function AiOrderCard({
  aiConfigured,
  aiMessage,
}: {
  aiConfigured: boolean;
  aiMessage: string;
}) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<AiOrderPlan | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/planner/ai-order", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as
        | (AiOrderPlan & { error?: undefined })
        | { error?: string };
      if (!res.ok || !("sections" in data)) {
        toast.error(
          ("error" in data ? data.error : null) ??
            "The recommendation could not be generated."
        );
        return;
      }
      setPlan(data);
      if (data.sections.length === 0) {
        toast.info("The AI found nothing that needs ordering right now.");
      }
    } catch {
      toast.error("The recommendation could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-gold-deep" aria-hidden />
            AI order recommendation
          </CardTitle>
          <CardDescription>
            A prioritized order plan built from your stock, open orders,
            forecasts and ordering policy — what to order now, what comes next.
          </CardDescription>
        </div>
        {aiConfigured ? (
          <Button variant="gold" onClick={generate} disabled={loading}>
            {loading ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Sparkles aria-hidden />
            )}
            {plan ? "Regenerate" : "Generate"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!aiConfigured ? (
          <p className="text-sm text-muted-foreground">{aiMessage}</p>
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Analyzing stock, forecasts and open orders…
          </p>
        ) : !plan ? (
          <p className="text-sm text-muted-foreground">
            Click Generate to get a precise, prioritized list of references to
            order — starting with what is needed right now.
          </p>
        ) : (
          <div className="space-y-6">
            {plan.summary ? (
              <p className="text-sm leading-relaxed">{plan.summary}</p>
            ) : null}
            {plan.sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing needs ordering right now — stock and open orders cover
                the forecast demand.
              </p>
            ) : (
              plan.sections.map((section, index) => (
                <section key={section.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      {index + 1}. {section.title}
                    </h3>
                    <Badge variant={SECTION_BADGE[section.key]}>
                      {section.items.length}{" "}
                      {section.items.length === 1 ? "item" : "items"}
                    </Badge>
                  </div>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">
                            PR code
                          </TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Units</TableHead>
                          <TableHead className="text-right">Boxes</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.items.map((item, i) => (
                          <TableRow key={`${item.prCode}-${i}`}>
                            <TableCell className="font-mono text-xs whitespace-nowrap">
                              {item.prCode}
                            </TableCell>
                            <TableCell className="min-w-40 font-medium">
                              {item.name}
                            </TableCell>
                            <TableCell className="text-right tnum">
                              {item.units}
                            </TableCell>
                            <TableCell className="text-right tnum">
                              {item.boxes ?? "—"}
                            </TableCell>
                            <TableCell className="min-w-56 text-sm text-muted-foreground">
                              {item.reason}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
