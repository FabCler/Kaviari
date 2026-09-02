/**
 * Who may open what, and who may change what.
 *
 * The artifact this app replaces could only hide menu items; here the section
 * list is checked again on the server inside every page and every action, so a
 * department that cannot see a screen cannot post to it either.
 */

export const DEPARTMENTS = [
  "Purchasing",
  "Customer Service",
  "Sales",
  "Warehouse DC2",
  "Management",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const SECTIONS = [
  "dashboard",
  "shipments",
  "imports",
  "validation",
  "soadjust",
  "exceptions",
  "receiving",
  "items",
  "users",
] as const;

export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  dashboard: "Dashboard",
  shipments: "Shipment Setup",
  imports: "SAP Imports",
  validation: "Validation",
  soadjust: "SO Adjustment",
  exceptions: "Exceptions",
  receiving: "Receiving Release",
  items: "Item Management",
  users: "User Management",
};

export const SECTION_PATHS: Record<Section, string> = {
  dashboard: "/",
  shipments: "/shipments",
  imports: "/imports",
  validation: "/validation",
  soadjust: "/so-adjustment",
  exceptions: "/exceptions",
  receiving: "/receiving",
  items: "/items",
  users: "/users",
};

/** What each department works in. Owners and admins see everything. */
const BY_DEPARTMENT: Record<Department, Section[]> = {
  Purchasing: [
    "dashboard",
    "shipments",
    "imports",
    "validation",
    "exceptions",
    "items",
  ],
  "Customer Service": [
    "dashboard",
    "validation",
    "soadjust",
    "exceptions",
  ],
  Sales: ["dashboard", "validation", "soadjust", "exceptions", "receiving"],
  "Warehouse DC2": ["dashboard", "receiving"],
  Management: [...SECTIONS],
};

export type Actor = {
  role: string;
  department: string;
  status: string;
};

export const isAdmin = (user: Actor): boolean =>
  user.role === "owner" || user.role === "admin";

export function sectionsFor(user: Actor): Section[] {
  if (isAdmin(user)) return [...SECTIONS];
  const list = BY_DEPARTMENT[user.department as Department];
  return list ? [...list] : ["dashboard"];
}

export function canSee(user: Actor, section: Section): boolean {
  return sectionsFor(user).includes(section);
}

/**
 * Which desk may clear which exception. The owner of an issue is the desk
 * named on it; admins may act for any desk (someone has to be able to unblock
 * a shipment at 2am).
 */
export function canResolve(user: Actor, issueOwner: string): boolean {
  if (isAdmin(user)) return true;
  const dept = user.department;
  if (issueOwner === "Sales/CS") {
    return dept === "Sales" || dept === "Customer Service";
  }
  return issueOwner === dept;
}
