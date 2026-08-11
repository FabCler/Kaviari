"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (response.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Incorrect PIN. Please try again.");
        setPin("");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pearl-dots flex min-h-dvh items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <h1 className="font-display text-4xl tracking-[0.2em] text-pearl">
            KAVIARI
          </h1>
          <p className="mt-2 text-xs font-medium tracking-[0.45em] text-gold uppercase">
            Cellar
          </p>
          <div className="gold-rule mx-auto mt-6 w-48" />
        </div>
        <form
          onSubmit={handleSubmit}
          className="mt-8 rounded-xl border border-white/10 bg-charcoal/60 p-6 shadow-2xl backdrop-blur"
        >
          <Label htmlFor="pin" className="text-pearl">
            Enter PIN
          </Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            className="mt-2 border-white/15 bg-navy-800 text-center text-lg tracking-[0.5em] text-pearl"
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="gold"
            className="mt-4 w-full"
            disabled={submitting || pin.length === 0}
          >
            {submitting ? "Unlocking…" : "Unlock"}
          </Button>
          <p className="mt-4 text-center text-xs text-pearl/50">
            Staff access · caviar inventory &amp; marketing
          </p>
        </form>
      </div>
    </div>
  );
}
