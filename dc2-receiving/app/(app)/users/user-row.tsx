"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { removeUser, updateUser } from "./actions";
import { DEPARTMENTS } from "@/lib/permissions";

export type UserView = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  status: string;
  isSelf: boolean;
  sections: string[];
  admin: boolean;
};

export function UserRow({ user }: { user: UserView }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function patch(data: Parameters<typeof updateUser>[1]) {
    setBusy(true);
    setError(null);
    const result = await updateUser(user.id, data);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  const owner = user.role === "owner";

  return (
    <tr className={user.status === "pending" ? "bg-warn-bg" : undefined}>
      <td>
        <span className="font-semibold">{user.name}</span>
        {user.isSelf ? <span className="pill pill-info ml-2">you</span> : null}
        <span className="block text-[10px] text-muted">{user.email}</span>
        {error ? (
          <span className="block text-[11px] font-medium text-bad">{error}</span>
        ) : null}
      </td>
      <td>
        <select
          className="field h-8"
          value={user.department}
          disabled={busy}
          onChange={(e) => patch({ department: e.target.value as never })}
        >
          <option value="">No department</option>
          {DEPARTMENTS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </td>
      <td>
        {owner ? (
          <span className="pill pill-info">Owner</span>
        ) : (
          <select
            className="field h-8"
            value={user.role}
            disabled={busy}
            onChange={(e) => patch({ role: e.target.value as "member" | "admin" })}
          >
            <option value="member">Member</option>
            <option value="admin">Administrator</option>
          </select>
        )}
      </td>
      <td>
        {owner ? (
          <span className="pill pill-good">Approved</span>
        ) : (
          <select
            className="field h-8"
            value={user.status}
            disabled={busy}
            onChange={(e) =>
              patch({ status: e.target.value as "pending" | "approved" | "blocked" })
            }
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="blocked">Blocked</option>
          </select>
        )}
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          {user.status === "approved" ? (
            user.sections.map((s) => (
              <span key={s} className="pill pill-good">
                {s}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-muted">
              Nothing until the account is approved.
            </span>
          )}
        </div>
        {user.admin ? (
          <p className="mt-1 text-[11px] text-muted">
            An administrator opens every screen.
          </p>
        ) : null}
      </td>
      <td>
        <div className="flex justify-end">
          {owner || user.isSelf ? (
            <span className="text-[11px] text-muted">—</span>
          ) : (
            <button
              className="btn btn-bad btn-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await removeUser(user.id);
                setBusy(false);
                if (!result.ok) setError(result.error);
                else router.refresh();
              }}
            >
              Remove
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
