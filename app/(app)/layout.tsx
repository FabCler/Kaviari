import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const assignments = await prisma.scmUserChannel.findMany({
    where: { userId: user.id },
    include: { channel: { select: { code: true } } },
  });
  return (
    <AppShell
      user={{
        name: user.name,
        role: user.role,
        department: user.department,
        allChannels: user.allChannels,
        channelCodes: assignments.map((row) => row.channel.code),
      }}
    >
      {children}
    </AppShell>
  );
}
