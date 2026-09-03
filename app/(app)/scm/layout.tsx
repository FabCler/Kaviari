import { redirect } from "next/navigation";
import { currentActor } from "@/lib/scm/guard";
import { can } from "@/lib/scm/permissions";
import { NoAccess } from "@/components/scm/no-access";

/**
 * Everything under /scm needs at least read access to the module. Users with
 * no department see one clear explanation instead of a dozen empty screens.
 */
export default async function ScmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (!can(actor, "documents.view") && !can(actor, "dashboard.view")) {
    return <NoAccess />;
  }
  return <>{children}</>;
}
