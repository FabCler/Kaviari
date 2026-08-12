"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        router.push("/");
        router.refresh();
      } else {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Sign-in failed. Please try again.");
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
          <Label htmlFor="email" className="text-pearl">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 border-white/15 bg-navy-800 text-pearl"
          />
          <Label htmlFor="password" className="mt-4 text-pearl">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 border-white/15 bg-navy-800 text-pearl"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="gold"
            className="mt-5 w-full"
            disabled={submitting || !email || !password}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="mt-4 text-center text-xs text-pearl/60">
            No account yet?{" "}
            <Link href="/register" className="text-champagne underline">
              Request access
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
