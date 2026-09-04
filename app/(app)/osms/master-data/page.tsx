import { osms } from "@/lib/osms/db";
import { currentActor } from "@/lib/osms/guard";
import { can, permissionMatrix } from "@/lib/osms/permissions";
import { getScmSettings } from "@/lib/osms/settings";
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
import { NoAccess } from "@/components/osms/no-access";
import { MasterDataView } from "@/components/osms/master-data-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Master data" };

/** §11 — products, suppliers, customers, units and their conversions. */
export default async function MasterDataPage() {
  const actor = (await currentActor())!;
  if (!can(actor, "master.manage")) return <NoAccess what="master data" />;

  const [
    suppliers,
    customers,
    units,
    conversions,
    products,
    settings,
    channels,
    tolerances,
  ] = await Promise.all([
      osms.supplier.findMany({ orderBy: { code: "asc" } }),
      osms.customer.findMany({ orderBy: { code: "asc" } }),
      osms.unit.findMany({ orderBy: { code: "asc" } }),
      osms.unitConversion.findMany({
        include: { product: { select: { code: true } } },
        orderBy: { fromUnit: "asc" },
      }),
      osms.product.findMany({
        where: { active: true },
        orderBy: { code: "asc" },
        take: 500,
      }),
      getScmSettings(),
      osms.businessChannel.findMany({
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
      osms.tolerance.findMany({
        include: {
          supplier: { select: { name: true } },
          channel: { select: { code: true, name: true } },
        },
        orderBy: { scope: "asc" },
      }),
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
          channelId: customer.channelId,
          deliveryLocation: customer.deliveryLocation,
          salesOwner: customer.salesOwner,
          active: customer.active,
        }))}
        channels={channels.map((channel) => ({
          id: channel.id,
          code: channel.code,
          name: channel.name,
          nameTh: channel.nameTh,
          sortOrder: channel.sortOrder,
          defaultPriority: channel.defaultPriority,
          active: channel.active,
        }))}
        tolerances={tolerances.map((rule) => ({
          id: rule.id,
          scope: rule.scope,
          target:
            rule.scope === "supplier"
              ? (rule.supplier?.name ?? "—")
              : rule.scope === "channel"
                ? (rule.channel?.code ?? "—")
                : rule.scope === "product_type"
                  ? (rule.productType ?? "—")
                  : "All",
          qtyTolerancePct: rule.qtyTolerancePct,
          priceTolerancePct: rule.priceTolerancePct,
          weightTolerancePct: rule.weightTolerancePct,
          note: rule.note,
          active: rule.active,
        }))}
        productTypes={[
          ...new Set(products.map((product) => product.category)),
        ].sort()}
        units={units.map((unit) => ({
          code: unit.code,
          name: unit.name,
          dimension: unit.dimension,
          active: unit.active,
        }))}
        conversions={conversions.map((conversion) => ({
          id: conversion.id,
          productCode: conversion.product?.code ?? null,
          fromUnit: conversion.fromUnit,
          toUnit: conversion.toUnit,
          factor: conversion.factor,
        }))}
        products={products.map((product) => ({
          id: product.id,
          code: product.code,
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
            Assign a department — and, for Sales, the business channels — to
            each account in Settings → Users. Every route handler re-checks
            this matrix server-side. A sales manager is a sales user who sees
            every channel.
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
                  <TableHead className="text-center">Sales mgr</TableHead>
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
                      {mark(row.salesManager)}
                    </TableCell>
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
