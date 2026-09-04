"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { humanize } from "@/components/osms/status-badge";

const ACTIONS = [
  "create",
  "update",
  "delete",
  "status_change",
  "approve",
  "reject",
  "import",
  "override",
];

/** §17 — search the trail by document, user, field, value or reason. */
export function AuditFilters({ entities }: { entities: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="audit-search">Search</Label>
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="audit-search"
            className="pl-9"
            defaultValue={params.get("q") ?? ""}
            placeholder="Document, user, field, value, reason…"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                update("q", (event.target as HTMLInputElement).value);
              }
            }}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-entity">Entity</Label>
        <Select
          value={params.get("entity") ?? "all"}
          onValueChange={(value) => update("entity", value)}
        >
          <SelectTrigger id="audit-entity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entities.map((entity) => (
              <SelectItem key={entity} value={entity}>
                {humanize(entity)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-action">Action</Label>
        <Select
          value={params.get("action") ?? "all"}
          onValueChange={(value) => update("action", value)}
        >
          <SelectTrigger id="audit-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {humanize(action)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
