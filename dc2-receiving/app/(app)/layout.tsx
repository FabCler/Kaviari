import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { sectionsFor } from "@/lib/permissions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell
      user={{ name: user.name, department: user.department, role: user.role }}
      sections={sectionsFor(user)}
    >
      {children}
    </AppShell>
  );
}
