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
  // shared
  "exceptions.manage",
  "documents.view",
  "dashboard.view",
  // admin
  "master.manage",
  "users.manage",
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
];

const WAREHOUSE: Permission[] = [
  "warehouse.view",
  "warehouse.receive",
  "warehouse.recordWeights",
  "warehouse.ship",
  "sales.allocate",
  "exceptions.manage",
  "documents.view",
  "dashboard.view",
];

const MANAGEMENT: Permission[] = [
  "purchasing.view",
  "sales.view",
  "warehouse.view",
  "documents.view",
  "dashboard.view",
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
}

/** The owner account is the system administrator, whatever its department. */
export function departmentOf(actor: Pick<Actor, "role" | "department">): Department {
  if (actor.role === "owner") return "admin";
  const dept = actor.department as Department;
  return dept in MATRIX ? dept : "none";
}

export function can(
  actor: Pick<Actor, "role" | "department">,
  permission: Permission
): boolean {
  return MATRIX[departmentOf(actor)].includes(permission);
}

export function canAny(
  actor: Pick<Actor, "role" | "department">,
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
    warehouse: MATRIX.warehouse.includes(permission),
    management: MATRIX.management.includes(permission),
  }));
}
