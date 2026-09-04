import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { resolveOsmsUser } from "@/lib/osms/access";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  // Department and channel scope live in the OSMS database, matched to this
  // account by email — the host user table holds no supply-chain columns.
  const access = await resolveOsmsUser(user.email, user.name);
  return (
    <AppShell
      user={{
        name: user.name,
        role: user.role,
        department: access.department,
        allChannels: access.allChannels,
        channelCodes: access.channelCodes,
      }}
    >
      {children}
    </AppShell>
  );
}
