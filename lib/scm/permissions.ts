import type { Department } from "@/lib/scm/domain";

/**
 * Role & permission matrix (§10 of the spec). One flat list of capabilities
 * keyed by department; the UI hides what a user cannot do and every route
 * handler re-checks server-side — hiding a button is not a permission.
 */

export const PERMISSIONS = [
  // import
  "import.demand",
  "import.po",
  "import.so",
  "import.invoice",
  // purchasing
  "purchasing.view",
  "purchasing.createPo",
  "purchasing.editPo",
  "purchasing.reconcilePoInvoice",
  "purchasing.approveVariance",
  // sales
  "sales.view",
  "sales.reviewDifference",
  "sales.adjustSo",
  "sales.allocate",
  // warehouse
  "warehouse.view",
  "warehouse.receive",
  "warehouse.recordWeights",
  "warehouse.ship",
  // warehouse stock & leftover
  "warehouse.stock",
  // cross-channel shortage — only management may rank channels (§20)
  "shortage.approve",
  // shared
  "exceptions.manage",
  "documents.view",
  "dashboard.view",
  "reports.view",
  // admin
  "master.manage",
  "users.manage",
  "channels.manage",
  "audit.view",
  "override",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PURCHASING: Permission[] = [
  "import.demand",
  "import.po",
  "import.invoice",
  "purchasing.view",
  "purchasing.createPo",
  "purchasing.editPo",
  "purchasing.reconcilePoInvoice",
  "purchasing.approveVariance",
  "exceptions.manage",
  "documents.view",
  "dashboard.view",
  "reports.view",
];

const SALES: Permission[] = [
  "import.so",
  "import.demand",
  "sales.view",
  "sales.reviewDifference",
  "sales.adjustSo",
  "sales.allocate",
  "exceptions.manage",
  "documents.view",
  "dashboard.view",
  "reports.view",
];

const WAREHOUSE: Permission[] = [
  "warehouse.view",
  "warehouse.receive",
  "warehouse.recordWeights",
  "warehouse.ship",
  "warehouse.stock",
  "sales.allocate",
  "exceptions.manage",
  "documents.view",
  "dashboard.view",
  "reports.view",
];

const MANAGEMENT: Permission[] = [
  "purchasing.view",
  "sales.view",
  "warehouse.view",
  "warehouse.stock",
  // Ranking channels against each other is a management decision (§20).
  "shortage.approve",
  "documents.view",
  "dashboard.view",
  "reports.view",
  "audit.view",
];

const MATRIX: Record<Department, readonly Permission[]> = {
  admin: PERMISSIONS,
  purchasing: PURCHASING,
  sales: SALES,
  warehouse: WAREHOUSE,
  management: MANAGEMENT,
  none: [],
};

export interface Actor {
  id: string;
  name: string;
  role: string;
  department: string;
  /**
   * A sales manager sees every business channel, including ones created
   * after their account — which is why this is a flag on the user and not a
   * set of assignment rows somebody has to remember to extend.
   */
  allChannels: boolean;
}

/**
 * A sales manager is a sales user who sees the whole business. They inherit
 * the sales permissions plus the cross-channel shortage approval, because
 * deciding which channel gets cut is exactly their job (§20, §39).
 */
export function isSalesManager(
  actor: Pick<Actor, "role" | "department" | "allChannels">
): boolean {
  return departmentOf(actor) === "sales" && actor.allChannels;
}

/** The owner account is the system administrator, whatever its department. */
export function departmentOf(actor: Pick<Actor, "role" | "department">): Department {
  if (actor.role === "owner") return "admin";
  const dept = actor.department as Department;
  return dept in MATRIX ? dept : "none";
}

export function can(
  actor: Pick<Actor, "role" | "department" | "allChannels">,
  permission: Permission
): boolean {
  if (permission === "shortage.approve" && isSalesManager(actor)) return true;
  return MATRIX[departmentOf(actor)].includes(permission);
}

export function canAny(
  actor: Pick<Actor, "role" | "department" | "allChannels">,
  permissions: readonly Permission[]
): boolean {
  return permissions.some((permission) => can(actor, permission));
}

export function permissionsFor(department: Department): readonly Permission[] {
  return MATRIX[department];
}

/** The matrix as rows, for the docs page and the admin screen. */
export function permissionMatrix() {
  return PERMISSIONS.map((permission) => ({
    permission,
    admin: MATRIX.admin.includes(permission),
    purchasing: MATRIX.purchasing.includes(permission),
    sales: MATRIX.sales.includes(permission),
    salesManager:
      MATRIX.sales.includes(permission) || permission === "shortage.approve",
    warehouse: MATRIX.warehouse.includes(permission),
    management: MATRIX.management.includes(permission),
  }));
}
