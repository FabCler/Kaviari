"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dropzone } from "@/components/import/dropzone";
import { cn } from "@/lib/utils";

/**
 * Import in two clicks: upload validates and shows every issue row by row;
 * "Import" commits exactly what was previewed. Errors block a row, warnings
 * do not — the difference is spelled out on screen, not left to guesswork.
 */

type Kind = "demand" | "po" | "so" | "invoice";

interface RowIssue {
  code: string;
  severity: "error" | "warning";
  field?: string;
  message: string;
}

interface PreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  issues: RowIssue[];
  data: Record<string, unknown> | null;
}

interface Preview {
  batchId: string;
  kind: Kind;
  fileName: string;
  sheetName: string;
  rows: PreviewRow[];
  okCount: number;
  errorCount: number;
  warningCount: number;
  unmatchedHeaders: string[];
  notices: string[];
  truncated: boolean;
}

const TABS: {
  kind: Kind;
  label: string;
  title: string;
  description: string;
  columns: string[];
}[] = [
  {
    kind: "demand",
    label: "Purchasing demand",
    title: "Import file from purchasing (§1.1)",
    description:
      "PR/SO lines with the PO number that covers them. Validated for duplicates, unknown product codes, unit mismatches, zero or negative quantities, missing PO/SO links and invalid dates.",
    columns: [
      "Delivery date",
      "Product code",
      "Product name (EN)",
      "Product name (TH)",
      "Inventory unit",
      "Quantity",
      "Purchase unit",
      "Product type",
      "PR no.",
      "SO no.",
      "Requester",
      "PO no.",
    ],
  },
  {
    kind: "po",
    label: "Purchase orders",
    title: "Import PO from purchasing (§1.2)",
    description:
      "The PO number is the primary reference — it links the order to its PR, SO, supplier, product and invoice.",
    columns: [
      "PO no.",
      "Supplier code",
      "Supplier name",
      "Product code",
      "Quantity",
      "Unit",
      "Unit price",
      "Price unit",
      "Currency",
      "Delivery date",
    ],
  },
  {
    kind: "so",
    label: "Sales orders",
    title: "Import SO from sales (§1.4)",
    description:
      "Customer orders. Linked to PR, PO, invoice, receiving and allocation through the SO number.",
    columns: [
      "SO no.",
      "Customer code",
      "Customer name",
      "Product code",
      "Quantity",
      "Unit",
      "Unit price",
      "Price unit",
      "Currency",
      "Delivery date",
      "Requester",
    ],
  },
  {
    kind: "invoice",
    label: "Supplier invoice",
    title: "Import invoice from supplier (§1.3)",
    description:
      "Upload the PDF. The system reads it, then purchasing checks every field before the invoice counts — corrections are recorded field by field.",
    columns: [],
  },
];

export function ImportView({
  permissions,
  purchaseOrders,
}: {
  permissions: Record<Kind, boolean>;
  purchaseOrders: { id: string; poNumber: string; supplierName: string }[];
}) {
  const first = TABS.find((tab) => permissions[tab.kind])?.kind ?? "demand";
  const [tab, setTab] = React.useState<Kind>(first);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Kind)}>
      <TabsList className="mb-4 flex-wrap">
        {TABS.map((entry) => (
          <TabsTrigger
            key={entry.kind}
            value={entry.kind}
            disabled={!permissions[entry.kind]}
          >
            {entry.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((entry) => (
        <TabsContent key={entry.kind} value={entry.kind}>
          {!permissions[entry.kind] ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Your department cannot import this file type.
              </CardContent>
            </Card>
          ) : entry.kind === "invoice" ? (
            <InvoiceImport
              title={entry.title}
              description={entry.description}
              purchaseOrders={purchaseOrders}
            />
          ) : (
            <SpreadsheetImport
              kind={entry.kind}
              title={entry.title}
              description={entry.description}
              columns={entry.columns}
            />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function SpreadsheetImport({
  kind,
  title,
  description,
  columns,
}: {
  kind: Kind;
  title: string;
  description: string;
  columns: string[];
}) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState<"analyze" | "commit" | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  async function analyze() {
    if (!file) return;
    setBusy("analyze");
    setPreview(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/scm/import", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The file could not be read.");
        return;
      }
      setPreview(payload as Preview);
      toast.success(
        `${payload.okCount} row(s) ready, ${payload.errorCount} blocked.`
      );
    } catch {
      toast.error("The upload failed — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy("commit");
    try {
      const response = await fetch("/api/scm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The import failed.");
        return;
      }
      toast.success(
        `${payload.imported} line(s) imported${payload.skipped ? `, ${payload.skipped} skipped` : ""}.`
      );
      for (const warning of payload.warnings ?? []) toast.warning(warning);
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch {
      toast.error("The import failed — try again.");
    } finally {
      setBusy(null);
    }
  }

  const rows = preview
    ? showAll
      ? preview.rows
      : preview.rows.filter((row) => row.issues.length > 0).slice(0, 60)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {columns.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
              Expected columns (English or Thai headers)
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {columns.map((column) => (
                <span
                  key={column}
                  className="rounded bg-card px-1.5 py-0.5 text-xs text-foreground"
                >
                  {column}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <Dropzone file={file} onFile={setFile} disabled={busy !== null} />

        <div className="flex flex-wrap gap-2">
          <Button onClick={analyze} disabled={!file || busy !== null}>
            {busy === "analyze" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Check the file
          </Button>
          {preview ? (
            <Button
              variant="gold"
              onClick={commit}
              disabled={busy !== null || preview.okCount === 0}
            >
              {busy === "commit" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Import {preview.okCount} row{preview.okCount === 1 ? "" : "s"}
            </Button>
          ) : null}
        </div>

        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Summary
                icon={<CircleCheck className="size-4" aria-hidden />}
                tone="success"
                label={`${preview.okCount} ready`}
              />
              <Summary
                icon={<TriangleAlert className="size-4" aria-hidden />}
                tone="warning"
                label={`${preview.warningCount} with warnings`}
              />
              <Summary
                icon={<CircleAlert className="size-4" aria-hidden />}
                tone="danger"
                label={`${preview.errorCount} blocked`}
              />
            </div>

            {preview.unmatchedHeaders.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Columns ignored: {preview.unmatchedHeaders.join(", ")}
              </p>
            ) : null}
            {preview.notices.map((notice) => (
              <p key={notice} className="text-xs text-muted-foreground">
                {notice}
              </p>
            ))}

            {rows.length === 0 ? (
              <p className="text-sm text-success">
                Every row passed validation.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Findings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const blocked = row.issues.some(
                        (issue) => issue.severity === "error"
                      );
                      return (
                        <TableRow key={row.rowNumber}>
                          <TableCell className="tnum align-top">
                            {row.rowNumber}
                          </TableCell>
                          <TableCell className="max-w-[24rem] align-top text-xs">
                            {Object.entries(row.raw)
                              .slice(0, 6)
                              .map(([key, value]) => (
                                <span key={key} className="mr-2 inline-block">
                                  <span className="text-muted-foreground">
                                    {key}:
                                  </span>{" "}
                                  {value}
                                </span>
                              ))}
                          </TableCell>
                          <TableCell className="align-top">
                            <ul className="space-y-0.5">
                              {row.issues.map((issue, index) => (
                                <li
                                  key={`${issue.code}-${index}`}
                                  className={cn(
                                    "text-xs",
                                    issue.severity === "error"
                                      ? "text-destructive"
                                      : "text-warning"
                                  )}
                                >
                                  {issue.severity === "error" ? "✕" : "!"}{" "}
                                  {issue.message}
                                </li>
                              ))}
                              {row.issues.length === 0 ? (
                                <li className="text-xs text-success">OK</li>
                              ) : null}
                            </ul>
                            {blocked ? (
                              <span className="text-[0.68rem] text-muted-foreground">
                                This row will not be imported.
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show only rows with findings" : "Show every row"}
            </Button>
            {preview.truncated ? (
              <p className="text-xs text-muted-foreground">
                Only the first 300 rows are previewed — the whole file is
                imported.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InvoiceImport({
  title,
  description,
  purchaseOrders,
}: {
  title: string;
  description: string;
  purchaseOrders: { id: string; poNumber: string; supplierName: string }[];
}) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [poId, setPoId] = React.useState<string>("auto");
  const [busy, setBusy] = React.useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (poId !== "auto") form.set("poId", poId);
      const response = await fetch("/api/scm/invoices", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The invoice could not be read.");
        if (payload.invoiceId) {
          router.push(`/scm/purchasing/invoices/${payload.invoiceId}`);
        }
        return;
      }
      for (const notice of payload.notices ?? []) toast.info(notice);
      toast.success(
        `${payload.invoiceNumber}: ${payload.lineCount} line(s) extracted — verify them now.`
      );
      router.push(`/scm/purchasing/invoices/${payload.id}`);
    } catch {
      toast.error("The upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dropzone file={file} onFile={setFile} disabled={busy} />

        <div className="max-w-sm space-y-1.5">
          <label className="text-sm font-medium" htmlFor="invoice-po">
            Purchase order
          </label>
          <Select value={poId} onValueChange={setPoId}>
            <SelectTrigger id="invoice-po">
              <SelectValue placeholder="Match automatically" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                Match automatically from the PO number
              </SelectItem>
              {purchaseOrders.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.poNumber} · {po.supplierName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pick a PO when the invoice does not print one, or prints the wrong
            one.
          </p>
        </div>

        <Button variant="gold" onClick={upload} disabled={!file || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Upload and read the invoice
        </Button>
      </CardContent>
    </Card>
  );
}

function Summary({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        tone === "danger" &&
          "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      {icon}
      {label}
    </span>
  );
}
