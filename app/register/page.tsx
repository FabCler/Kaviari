"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setDone(body.message ?? "Account created — you can sign in.");
      } else {
        setError(body.error ?? "Registration failed. Please try again.");
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
        {done ? (
          <div className="mt-8 rounded-xl border border-gold/40 bg-charcoal/60 p-6 text-center shadow-2xl backdrop-blur">
            <p className="text-2xl">✓</p>
            <p className="mt-2 text-sm text-pearl">{done}</p>
            <Button asChild variant="gold" className="mt-5 w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 rounded-xl border border-white/10 bg-charcoal/60 p-6 shadow-2xl backdrop-blur"
          >
            <p className="mb-4 text-sm text-pearl/80">
              Create your account — you can sign in right away.
            </p>
            <Label htmlFor="name" className="text-pearl">
              Full name
            </Label>
            <Input
              id="name"
              autoComplete="name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 border-white/15 bg-navy-800 text-pearl"
            />
            <Label htmlFor="email" className="mt-4 text-pearl">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 border-white/15 bg-navy-800 text-pearl"
            />
            <Label htmlFor="password" className="mt-4 text-pearl">
              Password{" "}
              <span className="text-pearl/50">(6 characters minimum)</span>
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
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
              disabled={submitting || !name || !email || password.length < 6}
            >
              {submitting ? "Creating…" : "Create account"}
            </Button>
            <p className="mt-4 text-center text-xs text-pearl/60">
              Already have an account?{" "}
              <Link href="/login" className="text-champagne underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
