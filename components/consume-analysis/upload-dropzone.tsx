"use client";

import * as React from "react";
import { CloudUpload, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPTED = [".xlsx", ".xls"];
const MAX_BYTES = 5 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function validate(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!ACCEPTED.some((ext) => lower.endsWith(ext))) {
    return "Unsupported file type — upload the filled .xlsx template.";
  }
  if (file.size > MAX_BYTES) return "That file is larger than 5 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/** Compact drag & drop zone for the filled forecast template (.xlsx only). */
export function UploadDropzone({
  file,
  onFile,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const accept = (candidate: File | undefined) => {
    if (!candidate) return;
    const error = validate(candidate);
    if (error) {
      toast.error(error);
      return;
    }
    onFile(candidate);
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy/5 text-navy">
          <FileSpreadsheet className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted-foreground tnum">{formatSize(file.size)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove file"
          disabled={disabled}
          onClick={() => {
            onFile(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) accept(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "rounded-xl border-2 border-dashed p-6 text-center transition-colors",
        dragging ? "border-gold bg-gold/5" : "border-border bg-card",
        disabled && "opacity-60"
      )}
    >
      <CloudUpload className="mx-auto size-7 text-muted-foreground" />
      <p className="mt-2 text-sm text-foreground">
        Drag the filled template here, or{" "}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="rounded-sm font-medium text-gold-deep underline underline-offset-2 hover:text-gold-deep/80 focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          browse
        </button>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">.xlsx — up to 5 MB</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        aria-label="Choose the filled forecast template"
        disabled={disabled}
        onChange={(e) => accept(e.target.files?.[0])}
      />
    </div>
  );
}
