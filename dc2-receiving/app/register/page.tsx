"use client";

import * as React from "react";
import Link from "next/link";
import { DEPARTMENTS } from "@/lib/permissions";

export default function RegisterPage() {
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
    department: DEPARTMENTS[0] as string,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setDone(body.message ?? "Account created.");
      else setError(body.error ?? "Registration failed.");
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
          <p className="mt-1 text-[11px] text-white/60">Request an account</p>
        </div>
        {done ? (
          <div className="mt-6 rounded-xl bg-white p-6 text-center shadow-2xl">
            <p className="text-sm font-semibold text-good">{done}</p>
            <p className="mt-2 text-xs text-muted">
              An owner has to approve the account and confirm your department
              before you can sign in.
            </p>
            <Link className="btn btn-secondary mt-5 w-full" href="/login">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 rounded-xl border border-white/10 bg-white p-6 shadow-2xl"
          >
            <label className="label" htmlFor="name">
              Name
            </label>
            <input id="name" className="field" required value={form.name} onChange={set("name")} />
            <label className="label mt-4" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              className="field"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set("email")}
            />
            <label className="label mt-4" htmlFor="department">
              Department
            </label>
            <select
              id="department"
              className="field"
              value={form.department}
              onChange={set("department")}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <label className="label mt-4" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="field"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={set("password")}
            />
            <p className="mt-1 text-[11px] text-muted">At least 8 characters.</p>
            {error ? (
              <p className="mt-4 rounded-lg bg-bad-bg px-3 py-2 text-xs font-medium text-bad">
                {error}
              </p>
            ) : null}
            <button className="btn mt-5 w-full" type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Request access"}
            </button>
            <p className="mt-4 text-center text-xs text-muted">
              Already have an account?{" "}
              <Link className="font-semibold text-rose-deep" href="/login">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
