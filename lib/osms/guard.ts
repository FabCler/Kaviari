import { getCurrentUser } from "@/lib/auth";
import { resolveOsmsUser } from "@/lib/osms/access";
import { can, departmentOf, type Actor, type Permission } from "@/lib/osms/permissions";
import { channelScopeFor, type ChannelScope } from "@/lib/osms/channels";

/**
 * Server-side permission guards. Route handlers call `requirePermission`;
 * pages call `currentActor` and hide what the actor cannot do. Both use the
 * same matrix, so a hidden button and a rejected request always agree.
 */

export async function currentActor(): Promise<Actor | null> {
  const account = await getCurrentUser();
  if (!account) return null;
  // The host application authenticated the person; OSMS looks up who that is
  // in its OWN user table, keyed by email. `id` below is the OSMS id — the one
  // written to audit rows — never the host's.
  const user = await resolveOsmsUser(account.email, account.name);
  return {
    id: user.id,
    name: user.name,
    role: account.role,
    department: user.department,
    allChannels: user.allChannels,
  };
}

export interface PermissionDenied {
  response: Response;
}

export async function requirePermission(
  permission: Permission
): Promise<Actor | Response> {
  const actor = await currentActor();
  if (!actor) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!can(actor, permission)) {
    return Response.json(
      {
        error: `Your department (${departmentOf(actor)}) is not allowed to ${permission.replace(/\./g, " → ")}.`,
      },
      { status: 403 }
    );
  }
  return actor;
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

/**
 * The actor plus the business channels they may see — the pair almost every
 * page needs, in one call.
 */
export async function currentScope(): Promise<
  { actor: Actor; scope: ChannelScope } | null
> {
  const actor = await currentActor();
  if (!actor) return null;
  return { actor, scope: await channelScopeFor(actor) };
}
