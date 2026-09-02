"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-rail to-rail-deep px-4">
      <div className="w-full max-w-sm">
        <div className="text-center text-white">
          <h1 className="text-xl font-extrabold tracking-[0.14em]">
            DC2 RECEIVING
          </h1>
          <p className="mt-1 text-[11px] text-white/60">
            Shipment Receiving Readiness
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-white/10 bg-white p-6 shadow-2xl"
        >
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="field"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="label mt-4" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <p className="mt-4 rounded-lg bg-bad-bg px-3 py-2 text-xs font-medium text-bad">
              {error}
            </p>
          ) : null}
          <button className="btn mt-5 w-full" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-4 text-center text-xs text-muted">
            No account yet?{" "}
            <Link className="font-semibold text-rose-deep" href="/register">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
