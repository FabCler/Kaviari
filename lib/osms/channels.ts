import { osms } from "@/lib/osms/db";
import type { Actor } from "@/lib/osms/permissions";
import { departmentOf } from "@/lib/osms/permissions";

/**
 * Business-channel scoping (§2, §39).
 *
 * Channels are rows, never an enum: adding "Wholesale" is one insert plus the
 * permission rows for whoever should see it — no migration and no code change.
 * Everything a user is allowed to see flows through `channelScopeFor()`, and
 * every query that touches customer demand applies the `where` it returns.
 */

export interface ChannelSummary {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  sortOrder: number;
  defaultPriority: number;
}

export interface ChannelScope {
  /** True when the user sees every channel, present and future. */
  all: boolean;
  /** Channel ids the user may see (empty + !all = sees nothing). */
  ids: string[];
  channels: ChannelSummary[];
}

/** Departments that always see the whole business, whatever their assignments. */
const ALL_CHANNEL_DEPARTMENTS = ["admin", "management", "warehouse", "purchasing"];

export async function listChannels(includeInactive = false): Promise<ChannelSummary[]> {
  const rows = await osms.businessChannel.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    nameTh: row.nameTh,
    sortOrder: row.sortOrder,
    defaultPriority: row.defaultPriority,
  }));
}

/**
 * What this actor may see. Purchasing and Warehouse work across the whole
 * business (§4.3), Sales is scoped to its channels (§4.2), and a sales
 * manager carries `allChannels` so a channel created later is covered without
 * anyone re-assigning them.
 */
export async function channelScopeFor(actor: Actor): Promise<ChannelScope> {
  const channels = await listChannels();
  const department = departmentOf(actor);

  if (ALL_CHANNEL_DEPARTMENTS.includes(department) || actor.allChannels) {
    return { all: true, ids: channels.map((channel) => channel.id), channels };
  }

  const assignments = await osms.userChannel.findMany({
    where: { userId: actor.id },
    select: { channelId: true },
  });
  const allowed = new Set(assignments.map((row) => row.channelId));
  const visible = channels.filter((channel) => allowed.has(channel.id));
  return { all: false, ids: visible.map((channel) => channel.id), channels: visible };
}

/**
 * Prisma `where` fragment for a `channelId` column. An unscoped user gets
 * `undefined` (no filter); a scoped user gets an explicit `in`, and a user
 * with no channels at all gets a filter that matches nothing — never an
 * accidental "see everything".
 */
export function channelWhere(
  scope: ChannelScope,
  requested?: string | null
): { in: string[] } | string | undefined {
  if (requested) {
    // A requested channel outside the scope must return nothing, not silently
    // widen to everything the user can see.
    if (!scope.all && !scope.ids.includes(requested)) return { in: [] };
    return requested;
  }
  if (scope.all) return undefined;
  return { in: scope.ids };
}

/**
 * Narrow a scope to the channel the URL asked for. A request for a channel
 * outside the scope collapses to an empty scope — the one failure mode that
 * must never widen access.
 */
export function narrowScope(
  scope: ChannelScope,
  requested?: string | null
): ChannelScope {
  if (!requested) return scope;
  if (!scope.all && !scope.ids.includes(requested)) {
    return { all: false, ids: [], channels: scope.channels };
  }
  return {
    all: false,
    ids: [requested],
    channels: scope.channels,
  };
}

/** Same decision for an in-memory row that already carries its channel. */
export function canSeeChannel(
  scope: ChannelScope,
  channelId: string | null | undefined
): boolean {
  if (scope.all) return true;
  if (!channelId) return false;
  return scope.ids.includes(channelId);
}

/** Resolve the channel a sales order belongs to, falling back to its customer. */
export async function resolveChannelId(
  customerId: string,
  explicit?: string | null
): Promise<string | null> {
  if (explicit) return explicit;
  const customer = await osms.customer.findUnique({
    where: { id: customerId },
    select: { channelId: true },
  });
  return customer?.channelId ?? null;
}

/** Look a channel up by its code, for the importers. */
export async function channelByCode(code: string | null | undefined) {
  if (!code) return null;
  return osms.businessChannel.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
}

/** The four channels the business starts with (§2). More are added as data. */
export const SEED_CHANNELS = [
  { code: "FS", name: "Food Service", nameTh: "ฟู้ดเซอร์วิส", sortOrder: 1, defaultPriority: 10 },
  { code: "RTL", name: "Retail", nameTh: "ค้าปลีก", sortOrder: 2, defaultPriority: 20 },
  { code: "STR", name: "Store", nameTh: "ร้านค้า", sortOrder: 3, defaultPriority: 30 },
  { code: "CK", name: "Central Kitchen", nameTh: "ครัวกลาง", sortOrder: 4, defaultPriority: 40 },
] as const;
