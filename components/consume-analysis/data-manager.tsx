"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Database, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUnits } from "@/lib/format";

interface MonthSummary {
  month: string;
  units: number;
  movements: number;
}

interface ProductRow {
  productId: string;
  prCode: string;
  name: string;
  unit: string;
  units: number;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Review, correct or delete recorded consumption month by month — covers
 * imported history as well as manually logged usage.
 */
export function DataManager() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [months, setMonths] = React.useState<MonthSummary[] | null>(null);
  const [month, setMonth] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ProductRow[] | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const loadMonths = React.useCallback(() => {
    return fetch("/api/consumption-data")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = await res.json();
        setMonths(body.months);
        return body.months as MonthSummary[];
      })
      .catch(() => {
        toast.error("Could not load the recorded months.");
        setMonths([]);
        return [] as MonthSummary[];
      });
  }, []);

  const loadRows = React.useCallback((m: string) => {
    setRows(null);
    return fetch(`/api/consumption-data?month=${m}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = await res.json();
        setRows(body.rows);
      })
      .catch(() => {
        toast.error("Could not load that month.");
        setRows([]);
      });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void loadMonths().then((list) => {
      if (list.length > 0) {
        setMonth(list[0].month);
        void loadRows(list[0].month);
      }
    });
  }, [open, loadMonths, loadRows]);

  async function refreshAll(m: string | null) {
    const list = await loadMonths();
    if (m && list.some((entry) => entry.month === m)) {
      await loadRows(m);
    } else {
      setMonth(list[0]?.month ?? null);
      if (list[0]) await loadRows(list[0].month);
      else setRows([]);
    }
    router.refresh();
  }

  async function saveEdit(row: ProductRow) {
    const tins = Number(editValue.replace(",", "."));
    if (!Number.isFinite(tins) || tins < 0) {
      toast.error("Enter a quantity of 0 or more.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/consumption-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, productId: row.productId, tins }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        tins > 0
          ? `${row.name}: ${monthLabel(month!)} set to ${formatUnits(tins, row.unit)}.`
          : `${row.name}: ${monthLabel(month!)} cleared.`
      );
      setEditing(null);
      await refreshAll(month);
    } catch {
      toast.error("The update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(row: ProductRow) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/consumption-data?month=${month}&productId=${row.productId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      toast.success(`${row.name}: ${monthLabel(month!)} data removed.`);
      await refreshAll(month);
    } catch {
      toast.error("The deletion failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMonth() {
    if (!month) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/consumption-data?month=${month}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      toast.success(
        `All ${monthLabel(month)} consumption removed (${body.deleted ?? 0} movements).`
      );
      await refreshAll(null);
    } catch {
      toast.error("The deletion failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Database className="size-4" /> Manage data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recorded consumption</DialogTitle>
          <DialogDescription>
            Correct or delete recorded consumption month by month — imported
            history included. Corrections replace the product&apos;s total for
            the month (spread across its weeks).
          </DialogDescription>
        </DialogHeader>

        {months === null ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : months.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No consumption recorded yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={month ?? undefined}
                onValueChange={(value) => {
                  setMonth(value);
                  setEditing(null);
                  void loadRows(value);
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Pick a month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.month} value={m.month}>
                      {monthLabel(m.month)} — {m.units} units
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !month}
                onClick={deleteMonth}
                className="text-destructive"
              >
                <Trash2 className="size-4" /> Delete whole month
              </Button>
            </div>

            {rows === null ? (
              <Skeleton className="h-40 w-full" />
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing recorded for this month.
              </p>
            ) : (
              <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Consumed</TableHead>
                      <TableHead className="w-28 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-mono text-xs">
                          {row.prCode}
                        </TableCell>
                        <TableCell className="max-w-52 truncate">
                          {row.name}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {editing === row.productId ? (
                            <Input
                              autoFocus
                              inputMode="decimal"
                              value={editValue}
                              onChange={(event) =>
                                setEditValue(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void saveEdit(row);
                                if (event.key === "Escape") setEditing(null);
                              }}
                              className="ml-auto h-8 w-24 text-right"
                            />
                          ) : (
                            formatUnits(row.units, row.unit)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editing === row.productId ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="gold"
                                disabled={busy}
                                onClick={() => void saveEdit(row)}
                                aria-label="Save"
                              >
                                <Check className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing(null)}
                                aria-label="Cancel"
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  setEditing(row.productId);
                                  setEditValue(String(row.units));
                                }}
                                aria-label={`Edit ${row.name}`}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void deleteProduct(row)}
                                aria-label={`Delete ${row.name}`}
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
