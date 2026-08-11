"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Creates a blank draft PO and navigates to it for manual line entry. */
export function NewPoButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function createBlank() {
    setPending(true);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSuggestions: false, lines: [] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        reference?: string;
        error?: string;
      };
      if (!res.ok || !data.id) {
        toast.error(data.error ?? "Could not create the purchase order.");
        return;
      }
      toast.success(`Draft ${data.reference ?? "PO"} created.`);
      router.push(`/purchase-orders/${data.id}`);
      router.refresh();
    } catch {
      toast.error("Could not create the purchase order.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" onClick={createBlank} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
      New blank PO
    </Button>
  );
}
