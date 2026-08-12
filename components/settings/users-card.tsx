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

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export function UsersCard() {
  const [users, setUsers] = React.useState<UserRow[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error();
      const body = await res.json();
      setUsers(body.users);
    } catch {
      toast.error("Could not load users.");
      setUsers([]);
    }
  }, []);

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
      toast.success(action === "approve" ? "Access approved." : "Access rejected.");
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
    status === "approved" ? (
      <Badge variant="success">Approved</Badge>
    ) : status === "pending" ? (
      <Badge variant="warning">Pending</Badge>
    ) : (
      <Badge variant="destructive">Rejected</Badge>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; access requests</CardTitle>
        <CardDescription>
          New sign-ups appear here as pending. You also receive an email with
          one-click approve/reject links when SMTP is configured.
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
            No accounts yet — team members can request access from the sign-in
            page.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
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
                  <TableCell>{statusBadge(user.status)}</TableCell>
                  <TableCell className="text-right">
                    {user.role !== "owner" && (
                      <div className="flex justify-end gap-1">
                        {user.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="gold"
                            disabled={busy === user.id}
                            onClick={() => act(user.id, "approve")}
                          >
                            <Check className="size-3.5" /> Approve
                          </Button>
                        )}
                        {user.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === user.id}
                            onClick={() => act(user.id, "reject")}
                          >
                            <X className="size-3.5" /> Reject
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
