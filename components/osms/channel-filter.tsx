"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Business-channel filter (§2, §41). A user who can only see one channel
 * gets a static label instead of a picker — a filter with a single option is
 * a decoration, not a control.
 */
export function ChannelFilter({
  channels,
  className,
  paramName = "channel",
}: {
  channels: { id: string; code: string; name: string }[];
  className?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get(paramName) ?? "all";

  if (channels.length <= 1) {
    return channels.length === 1 ? (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs",
          className
        )}
      >
        <span className="font-medium">{channels[0].code}</span>
        <span className="text-muted-foreground">{channels[0].name}</span>
      </span>
    ) : null;
  }

  function select(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete(paramName);
    else next.set(paramName, value);
    router.push(`?${next.toString()}`);
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1", className)}
      role="group"
      aria-label="Business channel"
    >
      <Chip active={current === "all"} onClick={() => select("all")}>
        All channels
      </Chip>
      {channels.map((channel) => (
        <Chip
          key={channel.id}
          active={current === channel.id}
          onClick={() => select(channel.id)}
          title={channel.name}
        >
          {channel.code}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-gold bg-gold/15 font-medium text-gold-deep"
          : "border-border bg-card text-muted-foreground hover:border-gold/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** Small inline badge for a channel code inside a table row. */
export function ChannelBadge({
  code,
  name,
  className,
}: {
  code: string | null | undefined;
  name?: string | null;
  className?: string;
}) {
  if (!code) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    );
  }
  return (
    <span
      title={name ?? undefined}
      className={cn(
        "inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[0.68rem] font-medium",
        className
      )}
    >
      {code}
    </span>
  );
}
