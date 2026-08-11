"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * "Create Draft PO" — asks the server to turn the current replenishment
 * suggestions into a draft purchase order, then navigates to it. Quantities
 * are always recomputed server-side.
 */
export function CreateDraftPoButton({
  size = "default",
}: {
  size?: "sm" | "default" | "lg";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function createDraft() {
    setPending(true);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSuggestions: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        reference?: string;
        error?: string;
      };
      if (!res.ok || !data.id) {
        toast.error(data.error ?? "Could not create the draft order.");
        return;
      }
      toast.success(`Draft ${data.reference ?? "PO"} created.`);
      router.push(`/purchase-orders/${data.id}`);
      router.refresh();
    } catch {
      toast.error("Could not create the draft order.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="gold" size={size} onClick={createDraft} disabled={pending}>
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <FilePlus2 aria-hidden />
      )}
      Create draft PO
    </Button>
  );
}
