import { prisma } from "@/lib/db";
import { currentActor } from "@/lib/scm/guard";
import { can, permissionMatrix } from "@/lib/scm/permissions";
import { getScmSettings } from "@/lib/scm/settings";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NoAccess } from "@/components/scm/no-access";
import { MasterDataView } from "@/components/scm/master-data-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Master data — Kaviari Cellar" };

/** §11 — products, suppliers, customers, units and their conversions. */
export default async function MasterDataPage() {
  const actor = (await currentActor())!;
  if (!can(actor, "master.manage")) return <NoAccess what="master data" />;

  const [suppliers, customers, units, conversions, products, settings] =
    await Promise.all([
      prisma.supplier.findMany({ orderBy: { code: "asc" } }),
      prisma.customer.findMany({ orderBy: { code: "asc" } }),
      prisma.scmUnit.findMany({ orderBy: { code: "asc" } }),
      prisma.scmUnitConversion.findMany({
        include: { product: { select: { prCode: true } } },
        orderBy: { fromUnit: "asc" },
      }),
      prisma.product.findMany({
        where: { active: true },
        orderBy: { prCode: "asc" },
        take: 500,
      }),
      getScmSettings(),
    ]);

  return (
    <div>
      <PageHeader
        title="Master data"
        description="Products, suppliers, customers, units and conversions — plus the tolerances every reconciliation uses."
      />

      <MasterDataView
        suppliers={suppliers.map((supplier) => ({
          id: supplier.id,
          code: supplier.code,
          name: supplier.name,
          currency: supplier.currency,
          defaultUnit: supplier.defaultUnit,
          moq: supplier.moq,
          leadTimeDays: supplier.leadTimeDays,
          active: supplier.active,
        }))}
        customers={customers.map((customer) => ({
          id: customer.id,
          code: customer.code,
          name: customer.name,
          deliveryLocation: customer.deliveryLocation,
          salesOwner: customer.salesOwner,
          active: customer.active,
        }))}
        units={units.map((unit) => ({
          code: unit.code,
          name: unit.name,
          dimension: unit.dimension,
          active: unit.active,
        }))}
        conversions={conversions.map((conversion) => ({
          id: conversion.id,
          productCode: conversion.product?.prCode ?? null,
          fromUnit: conversion.fromUnit,
          toUnit: conversion.toUnit,
          factor: conversion.factor,
        }))}
        products={products.map((product) => ({
          id: product.id,
          prCode: product.prCode,
          name: product.name,
          nameTh: product.nameTh,
          unit: product.unit,
          purchaseUnit: product.purchaseUnit,
          purchaseConversion: product.purchaseConversion,
          moq: product.moq,
          defaultSupplierId: product.defaultSupplierId,
          weightControlled: product.weightControlled,
        }))}
        settings={settings}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Role &amp; permission matrix</CardTitle>
          <p className="text-sm text-muted-foreground">
            Assign a department to each account in Settings → Users. Every route
            handler re-checks this matrix server-side.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permission</TableHead>
                  <TableHead className="text-center">Admin</TableHead>
                  <TableHead className="text-center">Purchasing</TableHead>
                  <TableHead className="text-center">Sales</TableHead>
                  <TableHead className="text-center">Warehouse</TableHead>
                  <TableHead className="text-center">Management</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissionMatrix().map((row) => (
                  <TableRow key={row.permission}>
                    <TableCell className="font-mono text-xs">
                      {row.permission}
                    </TableCell>
                    <TableCell className="text-center">{mark(row.admin)}</TableCell>
                    <TableCell className="text-center">
                      {mark(row.purchasing)}
                    </TableCell>
                    <TableCell className="text-center">{mark(row.sales)}</TableCell>
                    <TableCell className="text-center">
                      {mark(row.warehouse)}
                    </TableCell>
                    <TableCell className="text-center">
                      {mark(row.management)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function mark(allowed: boolean) {
  return allowed ? (
    <span className="text-success" aria-label="allowed">
      ●
    </span>
  ) : (
    <span className="text-muted-foreground/40" aria-label="not allowed">
      –
    </span>
  );
}
