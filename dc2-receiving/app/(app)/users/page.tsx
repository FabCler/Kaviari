import { prisma } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { isAdmin, sectionsFor, SECTION_LABELS } from "@/lib/permissions";
import { Callout, Empty, PageHeader } from "@/components/ui";
import { UserRow } from "./user-row";

export const metadata = { title: "User Management" };

export default async function UsersPage() {
  const actor = await requireSection("users");
  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const pending = users.filter((u) => u.status === "pending");

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Who may sign in, which department they work in, and what that department opens."
      />
      <Callout tone={pending.length ? "warn" : "info"}>
        {pending.length ? (
          <>
            <strong>
              {pending.length} account{pending.length === 1 ? "" : "s"} waiting for
              approval.
            </strong>{" "}
            A new account cannot open anything until it is approved and given a
            department.
          </>
        ) : (
          <>
            <strong>Access follows the department.</strong> The screens each one
            opens are listed on its row, and the server checks the same list on
            every page and every action — hiding a menu item is not the control.
          </>
        )}
      </Callout>

      {users.length === 0 ? (
        <Empty>No accounts yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 210 }}>User</th>
                <th style={{ width: 170 }}>Department</th>
                <th style={{ width: 130 }}>Role</th>
                <th style={{ width: 120 }}>Status</th>
                <th>Screens this account opens</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={{
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    department: u.department,
                    role: u.role,
                    status: u.status,
                    isSelf: u.id === actor.id,
                    sections: sectionsFor(u).map((s) => SECTION_LABELS[s]),
                    admin: isAdmin(u),
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
