"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SessionCard() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function logout() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth", { method: "DELETE" });
      if (!res.ok) throw new Error("Logout failed");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Logout failed — please try again");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Session</CardTitle>
        <CardDescription>
          You are signed in on this device with the cellar PIN.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={logout} disabled={busy}>
          <LogOut aria-hidden /> {busy ? "Signing out…" : "Log out"}
        </Button>
      </CardContent>
    </Card>
  );
}
