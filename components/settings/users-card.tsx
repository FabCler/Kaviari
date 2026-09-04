"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Trash2, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/osms/domain";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  department: string;
  allChannels: boolean;
  channelIds: string[];
  createdAt: string;
}

interface ChannelRow {
  id: string;
  code: string;
  name: string;
}

export function UsersCard() {
  const [users, setUsers] = React.useState<UserRow[] | null>(null);
  const [channels, setChannels] = React.useState<ChannelRow[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(
    () =>
      fetch("/api/users")
        .then(async (res) => {
          if (!res.ok) throw new Error();
          const body = await res.json();
          setUsers(body.users);
          setChannels(body.channels ?? []);
        })
        .catch(() => {
          toast.error("Could not load users.");
          setUsers([]);
        }),
    []
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      toast.success(action === "approve" ? "Account unblocked." : "Account blocked.");
      await load();
    } catch {
      toast.error("The action failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  /** OSMS department — this is what the permission matrix reads. */
  async function setDepartment(id: string, department: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_department", department }),
      });
      if (!res.ok) throw new Error();
      toast.success("Department updated.");
      await load();
    } catch {
      toast.error("The action failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * §39 — which business channels a sales user may see. "All channels" is a
   * flag rather than every box ticked, so a channel added next month is
   * covered without revisiting the account.
   */
  async function setChannels_(
    id: string,
    channelIds: string[],
    allChannels: boolean
  ) {
    setBusy(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_channels", channelIds, allChannels }),
      });
      if (!res.ok) throw new Error();
      toast.success("Channel access updated.");
      await load();
    } catch {
      toast.error("The action failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Account removed.");
      await load();
    } catch {
      toast.error("The action failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const statusBadge = (status: string) =>
    status === "rejected" ? (
      <Badge variant="destructive">Blocked</Badge>
    ) : (
      <Badge variant="success">Active</Badge>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; access requests</CardTitle>
        <CardDescription>
          Anyone who registers gets access immediately. The OSMS
          department decides what they can do in the procurement, sales and
          warehouse screens; block or remove an account here to revoke access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {users === null ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts yet — team members can create an account from the
            sign-in page.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>OSMS department</TableHead>
                <TableHead>Business channels</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    {user.role === "owner" ? (
                      <Badge variant="gold">Owner</Badge>
                    ) : (
                      <Badge variant="secondary">Member</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.role === "owner" ? (
                      <span className="text-sm text-muted-foreground">
                        Admin (owner)
                      </span>
                    ) : (
                      <Select
                        value={user.department}
                        disabled={busy === user.id}
                        onValueChange={(value) => setDepartment(user.id, value)}
                      >
                        <SelectTrigger
                          className="w-40"
                          aria-label={`Department for ${user.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPARTMENTS.filter(
                            (department) => department !== "admin"
                          ).map((department) => (
                            <SelectItem key={department} value={department}>
                              {DEPARTMENT_LABELS[department]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.role === "owner" ? (
                      <span className="text-sm text-muted-foreground">
                        All channels
                      </span>
                    ) : user.department !== "sales" ? (
                      <span className="text-sm text-muted-foreground">
                        {user.department === "none"
                          ? "—"
                          : "All channels (by department)"}
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          disabled={busy === user.id}
                          aria-pressed={user.allChannels}
                          onClick={() => setChannels_(user.id, [], !user.allChannels)}
                          className={
                            user.allChannels
                              ? "rounded border border-gold bg-gold/15 px-1.5 py-0.5 text-[0.68rem] font-medium text-gold-deep"
                              : "rounded border border-border px-1.5 py-0.5 text-[0.68rem] text-muted-foreground hover:border-gold/50"
                          }
                        >
                          Manager · all
                        </button>
                        {channels.map((channel) => {
                          const on =
                            user.allChannels || user.channelIds.includes(channel.id);
                          return (
                            <button
                              key={channel.id}
                              type="button"
                              disabled={busy === user.id || user.allChannels}
                              aria-pressed={on}
                              title={channel.name}
                              onClick={() => {
                                const next = user.channelIds.includes(channel.id)
                                  ? user.channelIds.filter((id) => id !== channel.id)
                                  : [...user.channelIds, channel.id];
                                setChannels_(user.id, next, false);
                              }}
                              className={
                                on
                                  ? "rounded border border-gold bg-gold/15 px-1.5 py-0.5 text-[0.68rem] font-medium text-gold-deep disabled:opacity-60"
                                  : "rounded border border-border px-1.5 py-0.5 text-[0.68rem] text-muted-foreground hover:border-gold/50"
                              }
                            >
                              {channel.code}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(user.status)}</TableCell>
                  <TableCell className="text-right">
                    {user.role !== "owner" && (
                      <div className="flex justify-end gap-1">
                        {user.status === "rejected" ? (
                          <Button
                            size="sm"
                            variant="gold"
                            disabled={busy === user.id}
                            onClick={() => act(user.id, "approve")}
                          >
                            <Check className="size-3.5" /> Unblock
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === user.id}
                            onClick={() => act(user.id, "reject")}
                          >
                            <X className="size-3.5" /> Block
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${user.name}`}
                          disabled={busy === user.id}
                          onClick={() => remove(user.id)}
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
        )}
      </CardContent>
    </Card>
  );
}
