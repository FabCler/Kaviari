"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge, documentTone } from "@/components/scm/status-badge";
import {
  DEPARTMENT_LABELS,
  EXCEPTION_LABELS,
  type Department,
  type ExceptionType,
} from "@/lib/scm/domain";
import { formatDate } from "@/lib/format";

export interface ExceptionRow {
  id: string;
  code: string;
  type: string;
  severity: string;
  documentNumber: string | null;
  documentType: string | null;
  description: string;
  reason: string | null;
  responsibleDept: string;
  action: string | null;
  dueDate: string | null;
  status: string;
  resolution: string | null;
  resolvedByName: string | null;
  createdAt: string;
}

const SEVERITY_TONE = {
  high: "blocked",
  medium: "pending",
  low: "idle",
} as const;

export function ExceptionBoard({
  rows,
  canManage,
}: {
  rows: ExceptionRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [resolution, setResolution] = React.useState<Record<string, string>>({});

  async function update(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    try {
      const response = await fetch("/api/scm/exceptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The exception could not be updated.");
        return;
      }
      toast.success("Exception updated.");
      router.refresh();
    } catch {
      toast.error("The request failed — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Exception</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Responsible</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const overdue =
                  row.dueDate != null &&
                  new Date(row.dueDate) < new Date() &&
                  ["open", "in_progress"].includes(row.status);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.code}</div>
                      <ToneBadge
                        tone={
                          SEVERITY_TONE[row.severity as keyof typeof SEVERITY_TONE] ??
                          "idle"
                        }
                      >
                        {row.severity}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="max-w-[22rem]">
                      <div className="text-sm font-medium">
                        {EXCEPTION_LABELS[row.type as ExceptionType] ?? row.type}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.description}
                      </div>
                      {row.reason ? (
                        <div className="text-xs text-muted-foreground">
                          Reason: {row.reason}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.documentNumber ?? "-"}
                      <div className="text-xs text-muted-foreground">
                        {row.documentType ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <Select
                          value={row.responsibleDept}
                          onValueChange={(value) =>
                            update(row.id, { responsibleDept: value })
                          }
                        >
                          <SelectTrigger
                            className="w-36"
                            aria-label={`Responsible department for ${row.code}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              [
                                "purchasing",
                                "sales",
                                "warehouse",
                                "management",
                                "admin",
                              ] as Department[]
                            ).map((department) => (
                              <SelectItem key={department} value={department}>
                                {DEPARTMENT_LABELS[department]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">
                          {DEPARTMENT_LABELS[row.responsibleDept as Department] ??
                            row.responsibleDept}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-sm">
                      {row.action ?? "-"}
                      {row.resolution ? (
                        <div className="text-xs text-success">
                          {row.resolution}
                          {row.resolvedByName ? ` · ${row.resolvedByName}` : ""}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {canManage && row.status !== "resolved" ? (
                        <Input
                          type="date"
                          className="w-36"
                          defaultValue={row.dueDate ?? ""}
                          onChange={(event) =>
                            update(row.id, { dueDate: event.target.value || null })
                          }
                          aria-label={`Due date for ${row.code}`}
                        />
                      ) : (
                        <span
                          className={
                            overdue ? "text-sm text-destructive" : "text-sm"
                          }
                        >
                          {row.dueDate ? formatDate(new Date(row.dueDate)) : "-"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={documentTone(row.status)}>
                        {row.status.replace("_", " ")}
                      </ToneBadge>
                    </TableCell>
                    <TableCell>
                      {canManage && row.status !== "resolved" ? (
                        <div className="flex flex-col gap-1.5">
                          {row.status === "open" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === row.id}
                              onClick={() =>
                                update(row.id, { status: "in_progress" })
                              }
                            >
                              Start
                            </Button>
                          ) : null}
                          <Input
                            placeholder="Resolution"
                            className="w-44"
                            value={resolution[row.id] ?? ""}
                            onChange={(event) =>
                              setResolution((current) => ({
                                ...current,
                                [row.id]: event.target.value,
                              }))
                            }
                            aria-label={`Resolution for ${row.code}`}
                          />
                          <Button
                            size="sm"
                            variant="gold"
                            disabled={
                              busy === row.id || !(resolution[row.id] ?? "").trim()
                            }
                            onClick={() =>
                              update(row.id, {
                                status: "resolved",
                                resolution: resolution[row.id],
                              })
                            }
                          >
                            {busy === row.id ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : null}
                            Resolve
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
