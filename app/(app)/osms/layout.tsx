import { redirect } from "next/navigation";
import { currentActor } from "@/lib/osms/guard";
import { can } from "@/lib/osms/permissions";
import { NoAccess } from "@/components/osms/no-access";
import type { Metadata } from "next";

/** OSMS is its own system, so it names its own tabs. */
export const metadata: Metadata = {
  title: {
    default: "Order & Supply Management System",
    template: "%s · OSMS",
  },
  description:
    "Customer order to purchase order, supplier invoice reconciliation, receiving, allocation and customer shipment — with a full audit trail.",
};

/**
 * Everything under /osms needs at least read access to the module. Users with
 * no department see one clear explanation instead of a dozen empty screens.
 */
export default async function Layout({
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
