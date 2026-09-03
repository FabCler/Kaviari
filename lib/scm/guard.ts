import { getCurrentUser } from "@/lib/auth";
import { can, departmentOf, type Actor, type Permission } from "@/lib/scm/permissions";

/**
 * Server-side permission guards. Route handlers call `requirePermission`;
 * pages call `currentActor` and hide what the actor cannot do. Both use the
 * same matrix, so a hidden button and a rejected request always agree.
 */

export async function currentActor(): Promise<Actor | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    department: user.department,
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
