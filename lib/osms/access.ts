import { osms } from "@/lib/osms/db";

/**
 * The one seam between OSMS and whatever application signs the user in.
 *
 * OSMS keeps its own `users` table in its own database, so a host account and
 * an OSMS operator are two different rows in two different systems. They are
 * matched on the only identifier both sides agree on: the email address.
 *
 * This is deliberately the *only* file that knows a host exists. Pointing OSMS
 * at SAP Business One, an HR directory or a corporate SSO means rewriting this
 * resolver — nothing else in the module changes.
 */

export interface OsmsAccess {
  /** OSMS user id — the one written to audit rows and approvals. */
  id: string;
  email: string;
  name: string;
  /** admin | purchasing | sales | warehouse | management | none */
  department: string;
  allChannels: boolean;
  channelIds: string[];
  channelCodes: string[];
}

/**
 * Find the OSMS operator behind a signed-in email, creating a dormant record
 * on first sight. A brand-new operator lands in department `none`, which the
 * permission matrix reads as "no access" — an account has to be granted a
 * department deliberately, never by the act of logging in.
 */
export async function resolveOsmsUser(
  email: string,
  name: string
): Promise<OsmsAccess> {
  const user = await osms.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, department: "none" },
    include: { channels: { include: { channel: { select: { id: true, code: true } } } } },
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    department: user.department,
    allChannels: user.allChannels,
    channelIds: user.channels.map((row) => row.channel.id),
    channelCodes: user.channels.map((row) => row.channel.code),
  };
}

/** Read-only lookup: returns null when the email has never reached OSMS. */
export async function findOsmsUser(email: string): Promise<OsmsAccess | null> {
  const user = await osms.user.findUnique({
    where: { email },
    include: { channels: { include: { channel: { select: { id: true, code: true } } } } },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    department: user.department,
    allChannels: user.allChannels,
    channelIds: user.channels.map((row) => row.channel.id),
    channelCodes: user.channels.map((row) => row.channel.code),
  };
}

/** Bulk variant for the account-administration screen. */
export async function findOsmsUsers(
  emails: string[]
): Promise<Map<string, OsmsAccess>> {
  const users = await osms.user.findMany({
    where: { email: { in: emails } },
    include: { channels: { include: { channel: { select: { id: true, code: true } } } } },
  });
  return new Map(
    users.map((user) => [
      user.email,
      {
        id: user.id,
        email: user.email,
        name: user.name,
        department: user.department,
        allChannels: user.allChannels,
        channelIds: user.channels.map((row) => row.channel.id),
        channelCodes: user.channels.map((row) => row.channel.code),
      },
    ])
  );
}

/** Grant or change an operator's department. */
export async function setDepartment(
  email: string,
  name: string,
  department: string
): Promise<OsmsAccess> {
  await resolveOsmsUser(email, name);
  await osms.user.update({ where: { email }, data: { department } });
  return (await findOsmsUser(email))!;
}

/**
 * Replace an operator's channel assignments. `allChannels` wins over the list:
 * a sales manager sees channels created after their account, which is why it
 * is a flag rather than rows somebody has to keep in step.
 */
export async function setChannels(
  email: string,
  name: string,
  channelIds: string[],
  allChannels: boolean
): Promise<OsmsAccess> {
  const user = await resolveOsmsUser(email, name);
  await osms.userChannel.deleteMany({ where: { userId: user.id } });
  if (!allChannels && channelIds.length > 0) {
    const known = await osms.businessChannel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true },
    });
    await osms.userChannel.createMany({
      data: known.map((channel) => ({ userId: user.id, channelId: channel.id })),
    });
  }
  await osms.user.update({ where: { email }, data: { allChannels } });
  return (await findOsmsUser(email))!;
}
