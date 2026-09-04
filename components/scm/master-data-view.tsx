"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ScmSettings } from "@/lib/scm/settings";

/**
 * §11 — the master-data editor. Records are deactivated, never deleted, so
 * historical documents keep resolving (§12).
 */

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  currency: string;
  defaultUnit: string;
  moq: number | null;
  leadTimeDays: number | null;
  active: boolean;
}

interface CustomerRow {
  id: string;
  code: string;
  name: string;
  channelId: string | null;
  deliveryLocation: string | null;
  salesOwner: string | null;
  active: boolean;
}

interface ChannelRow {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  sortOrder: number;
  defaultPriority: number;
  active: boolean;
}

interface ToleranceRow {
  id: string;
  scope: string;
  target: string;
  qtyTolerancePct: number;
  priceTolerancePct: number;
  weightTolerancePct: number;
  note: string | null;
  active: boolean;
}

interface UnitRow {
  code: string;
  name: string;
  dimension: string;
  active: boolean;
}

interface ConversionRow {
  id: string;
  productCode: string | null;
  fromUnit: string;
  toUnit: string;
  factor: number;
}

interface ProductRow {
  id: string;
  prCode: string;
  name: string;
  nameTh: string | null;
  unit: string;
  purchaseUnit: string | null;
  purchaseConversion: number | null;
  moq: number | null;
  defaultSupplierId: string | null;
  weightControlled: boolean;
}

async function post(entity: string, body: unknown): Promise<boolean> {
  const response = await fetch(`/api/scm/master/${entity}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    toast.error(payload.error ?? "The record could not be saved.");
    return false;
  }
  toast.success("Saved.");
  return true;
}

export function MasterDataView({
  suppliers,
  customers,
  units,
  conversions,
  products,
  settings,
  channels,
  tolerances,
  productTypes,
}: {
  suppliers: SupplierRow[];
  customers: CustomerRow[];
  units: UnitRow[];
  conversions: ConversionRow[];
  products: ProductRow[];
  settings: ScmSettings;
  channels: ChannelRow[];
  tolerances: ToleranceRow[];
  productTypes: string[];
}) {
  return (
    <Tabs defaultValue="channels">
      <TabsList className="mb-4 flex-wrap">
        <TabsTrigger value="channels">Business channels</TabsTrigger>
        <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        <TabsTrigger value="customers">Customers</TabsTrigger>
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="units">Units &amp; conversions</TabsTrigger>
        <TabsTrigger value="tolerances">Tolerances</TabsTrigger>
      </TabsList>

      <TabsContent value="channels">
        <ChannelPanel rows={channels} />
      </TabsContent>
      <TabsContent value="suppliers">
        <SupplierPanel rows={suppliers} />
      </TabsContent>
      <TabsContent value="customers">
        <CustomerPanel rows={customers} channels={channels} />
      </TabsContent>
      <TabsContent value="products">
        <ProductPanel rows={products} suppliers={suppliers} />
      </TabsContent>
      <TabsContent value="units">
        <UnitPanel units={units} conversions={conversions} products={products} />
      </TabsContent>
      <TabsContent value="tolerances">
        <TolerancePanel
          settings={settings}
          rules={tolerances}
          suppliers={suppliers}
          channels={channels}
          productTypes={productTypes}
        />
      </TabsContent>
    </Tabs>
  );
}

/**
 * §2 — channels are data. Adding one here is all it takes for it to appear in
 * every filter, permission list and report; nothing in the schema changes.
 */
function ChannelPanel({ rows }: { rows: ChannelRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState({
    code: "",
    name: "",
    nameTh: "",
    sortOrder: "",
    defaultPriority: "100",
  });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const ok = await post("channels", {
      code: draft.code,
      name: draft.name,
      nameTh: draft.nameTh || null,
      sortOrder: Number(draft.sortOrder) || rows.length + 1,
      defaultPriority: Number(draft.defaultPriority) || 100,
      active: true,
    });
    setBusy(false);
    if (ok) {
      setDraft({ code: "", name: "", nameTh: "", sortOrder: "", defaultPriority: "100" });
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Business channels</CardTitle>
        <p className="text-sm text-muted-foreground">
          Food Service, Retail, Store and Central Kitchen ship with the system.
          A new channel is a row here — no migration, no code change. The
          default priority is the order proposed when several channels compete
          for short stock; it is never applied without an approval.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Code" value={draft.code} onChange={(v) => setDraft({ ...draft, code: v })} />
          <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <Field label="Thai name" value={draft.nameTh} onChange={(v) => setDraft({ ...draft, nameTh: v })} />
          <Field label="Sort order" type="number" value={draft.sortOrder} onChange={(v) => setDraft({ ...draft, sortOrder: v })} />
          <div className="flex items-end gap-2">
            <Field
              label="Default priority"
              type="number"
              value={draft.defaultPriority}
              onChange={(v) => setDraft({ ...draft, defaultPriority: v })}
            />
            <Button onClick={save} disabled={busy || !draft.code || !draft.name}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              Add
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Thai name</TableHead>
                <TableHead className="text-right">Sort</TableHead>
                <TableHead className="text-right">Default priority</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.nameTh ?? "—"}</TableCell>
                  <TableCell className="tnum text-right">{row.sortOrder}</TableCell>
                  <TableCell className="tnum text-right">
                    <Input
                      type="number"
                      className="w-24"
                      defaultValue={row.defaultPriority}
                      aria-label={`Default priority for ${row.code}`}
                      onBlur={async (event) => {
                        const value = Number(event.target.value);
                        if (value === row.defaultPriority) return;
                        const ok = await post("channels", {
                          ...row,
                          defaultPriority: value,
                        });
                        if (ok) router.refresh();
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.active}
                      aria-label={`${row.code} active`}
                      onCheckedChange={async (checked) => {
                        const ok = await post("channels", { ...row, active: checked });
                        if (ok) router.refresh();
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SupplierPanel({ rows }: { rows: SupplierRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState({
    code: "",
    name: "",
    currency: "EUR",
    defaultUnit: "KG",
    moq: "",
    leadTimeDays: "",
  });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const ok = await post("suppliers", {
      code: draft.code,
      name: draft.name,
      currency: draft.currency,
      defaultUnit: draft.defaultUnit,
      moq: draft.moq ? Number(draft.moq) : null,
      leadTimeDays: draft.leadTimeDays ? Number(draft.leadTimeDays) : null,
      active: true,
    });
    setBusy(false);
    if (ok) {
      setDraft({
        code: "",
        name: "",
        currency: "EUR",
        defaultUnit: "KG",
        moq: "",
        leadTimeDays: "",
      });
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supplier master</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Code" value={draft.code} onChange={(v) => setDraft({ ...draft, code: v })} />
          <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <Field label="Currency" value={draft.currency} onChange={(v) => setDraft({ ...draft, currency: v })} />
          <Field label="Default unit" value={draft.defaultUnit} onChange={(v) => setDraft({ ...draft, defaultUnit: v })} />
          <Field label="MOQ" value={draft.moq} onChange={(v) => setDraft({ ...draft, moq: v })} type="number" />
          <div className="flex items-end gap-2">
            <Field
              label="Lead time (d)"
              value={draft.leadTimeDays}
              onChange={(v) => setDraft({ ...draft, leadTimeDays: v })}
              type="number"
            />
            <Button onClick={save} disabled={busy || !draft.code || !draft.name}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              Add
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Default unit</TableHead>
                <TableHead className="text-right">MOQ</TableHead>
                <TableHead className="text-right">Lead time</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.currency}</TableCell>
                  <TableCell>{row.defaultUnit}</TableCell>
                  <TableCell className="tnum text-right">{row.moq ?? "-"}</TableCell>
                  <TableCell className="tnum text-right">
                    {row.leadTimeDays ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.active}
                      aria-label={`${row.code} active`}
                      onCheckedChange={async (checked) => {
                        const ok = await post("suppliers", { ...row, active: checked });
                        if (ok) router.refresh();
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerPanel({
  rows,
  channels,
}: {
  rows: CustomerRow[];
  channels: ChannelRow[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState({
    code: "",
    name: "",
    channelId: channels[0]?.id ?? "",
    deliveryLocation: "",
    salesOwner: "",
  });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const ok = await post("customers", {
      code: draft.code,
      name: draft.name,
      channelId: draft.channelId || null,
      deliveryLocation: draft.deliveryLocation || null,
      salesOwner: draft.salesOwner || null,
      active: true,
    });
    setBusy(false);
    if (ok) {
      setDraft({
        code: "",
        name: "",
        channelId: channels[0]?.id ?? "",
        deliveryLocation: "",
        salesOwner: "",
      });
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customer master</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Code" value={draft.code} onChange={(v) => setDraft({ ...draft, code: v })} />
          <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <div className="space-y-1.5">
            <Label htmlFor="customer-channel">Business channel</Label>
            <Select
              value={draft.channelId}
              onValueChange={(value) => setDraft({ ...draft, channelId: value })}
            >
              <SelectTrigger id="customer-channel">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.code} · {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="Delivery location"
            value={draft.deliveryLocation}
            onChange={(v) => setDraft({ ...draft, deliveryLocation: v })}
          />
          <Field
            label="Sales owner"
            value={draft.salesOwner}
            onChange={(v) => setDraft({ ...draft, salesOwner: v })}
          />
          <div className="flex items-end">
            <Button onClick={save} disabled={busy || !draft.code || !draft.name}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              Add
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-44">Channel</TableHead>
                <TableHead>Delivery location</TableHead>
                <TableHead>Sales owner</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <Select
                      value={row.channelId ?? "none"}
                      onValueChange={async (value) => {
                        const ok = await post("customers", {
                          ...row,
                          channelId: value === "none" ? null : value,
                        });
                        if (ok) router.refresh();
                      }}
                    >
                      <SelectTrigger aria-label={`Channel for ${row.code}`}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No channel</SelectItem>
                        {channels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id}>
                            {channel.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{row.deliveryLocation ?? "-"}</TableCell>
                  <TableCell>{row.salesOwner ?? "-"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={row.active}
                      aria-label={`${row.code} active`}
                      onCheckedChange={async (checked) => {
                        const ok = await post("customers", { ...row, active: checked });
                        if (ok) router.refresh();
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductPanel({
  rows,
  suppliers,
}: {
  rows: ProductRow[];
  suppliers: SupplierRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const filtered = rows.filter((row) =>
    `${row.prCode} ${row.name} ${row.nameTh ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  async function update(row: ProductRow, patch: Partial<ProductRow>) {
    const ok = await post("products", {
      id: row.id,
      nameTh: patch.nameTh ?? row.nameTh,
      purchaseUnit: patch.purchaseUnit ?? row.purchaseUnit,
      purchaseConversion: patch.purchaseConversion ?? row.purchaseConversion,
      moq: patch.moq ?? row.moq,
      defaultSupplierId:
        patch.defaultSupplierId !== undefined
          ? patch.defaultSupplierId
          : row.defaultSupplierId,
      weightControlled: patch.weightControlled ?? row.weightControlled,
    });
    if (ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Product master</CardTitle>
        <p className="text-sm text-muted-foreground">
          The supply-chain fields on the shared product catalog: Thai name,
          purchase unit and conversion, MOQ, default supplier, and whether the
          product is weighed piece by piece.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search a product…"
          className="max-w-sm"
          aria-label="Search products"
        />
        <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-44">Thai name</TableHead>
                <TableHead>Stock unit</TableHead>
                <TableHead className="w-28">Purchase unit</TableHead>
                <TableHead className="w-28">Conversion</TableHead>
                <TableHead className="w-24">MOQ</TableHead>
                <TableHead className="w-44">Default supplier</TableHead>
                <TableHead className="w-24">Weighed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 200).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.prCode}</TableCell>
                  <TableCell className="max-w-[16rem] truncate">{row.name}</TableCell>
                  <TableCell>
                    <Input
                      defaultValue={row.nameTh ?? ""}
                      onBlur={(event) =>
                        event.target.value !== (row.nameTh ?? "") &&
                        update(row, { nameTh: event.target.value || null })
                      }
                      aria-label={`Thai name for ${row.prCode}`}
                    />
                  </TableCell>
                  <TableCell>{row.unit}</TableCell>
                  <TableCell>
                    <Input
                      defaultValue={row.purchaseUnit ?? ""}
                      onBlur={(event) =>
                        event.target.value !== (row.purchaseUnit ?? "") &&
                        update(row, { purchaseUnit: event.target.value || null })
                      }
                      aria-label={`Purchase unit for ${row.prCode}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.001"
                      defaultValue={row.purchaseConversion ?? ""}
                      onBlur={(event) =>
                        update(row, {
                          purchaseConversion: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      aria-label={`Conversion for ${row.prCode}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.001"
                      defaultValue={row.moq ?? ""}
                      onBlur={(event) =>
                        update(row, {
                          moq: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      aria-label={`MOQ for ${row.prCode}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.defaultSupplierId ?? "none"}
                      onValueChange={(value) =>
                        update(row, {
                          defaultSupplierId: value === "none" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger aria-label={`Default supplier for ${row.prCode}`}>
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.weightControlled}
                      aria-label={`${row.prCode} weighed per piece`}
                      onCheckedChange={(checked) =>
                        update(row, { weightControlled: checked })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function UnitPanel({
  units,
  conversions,
  products,
}: {
  units: UnitRow[];
  conversions: ConversionRow[];
  products: ProductRow[];
}) {
  const router = useRouter();
  const [unitDraft, setUnitDraft] = React.useState({
    code: "",
    name: "",
    dimension: "count",
  });
  const [conversionDraft, setConversionDraft] = React.useState({
    productId: "none",
    fromUnit: "",
    toUnit: "",
    factor: "",
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field
              label="Code"
              value={unitDraft.code}
              onChange={(v) => setUnitDraft({ ...unitDraft, code: v })}
            />
            <Field
              label="Name"
              value={unitDraft.name}
              onChange={(v) => setUnitDraft({ ...unitDraft, name: v })}
            />
            <div className="space-y-1.5">
              <Label htmlFor="unit-dimension">Dimension</Label>
              <Select
                value={unitDraft.dimension}
                onValueChange={(value) =>
                  setUnitDraft({ ...unitDraft, dimension: value })
                }
              >
                <SelectTrigger id="unit-dimension">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weight">Weight</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                  <SelectItem value="volume">Volume</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                disabled={!unitDraft.code || !unitDraft.name}
                onClick={async () => {
                  const ok = await post("units", { ...unitDraft, active: true });
                  if (ok) {
                    setUnitDraft({ code: "", name: "", dimension: "count" });
                    router.refresh();
                  }
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Dimension</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => (
                  <TableRow key={unit.code}>
                    <TableCell className="font-medium">{unit.code}</TableCell>
                    <TableCell>{unit.name}</TableCell>
                    <TableCell>{unit.dimension}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversions</CardTitle>
          <p className="text-sm text-muted-foreground">
            quantity(to) = quantity(from) × factor. A product-specific rule
            wins over the global one.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="conversion-product">Product</Label>
              <Select
                value={conversionDraft.productId}
                onValueChange={(value) =>
                  setConversionDraft({ ...conversionDraft, productId: value })
                }
              >
                <SelectTrigger id="conversion-product">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All products</SelectItem>
                  {products.slice(0, 200).map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.prCode} · {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="From"
              value={conversionDraft.fromUnit}
              onChange={(v) => setConversionDraft({ ...conversionDraft, fromUnit: v })}
            />
            <Field
              label="To"
              value={conversionDraft.toUnit}
              onChange={(v) => setConversionDraft({ ...conversionDraft, toUnit: v })}
            />
            <div className="flex items-end gap-2">
              <Field
                label="Factor"
                type="number"
                value={conversionDraft.factor}
                onChange={(v) => setConversionDraft({ ...conversionDraft, factor: v })}
              />
              <Button
                disabled={
                  !conversionDraft.fromUnit ||
                  !conversionDraft.toUnit ||
                  !conversionDraft.factor
                }
                onClick={async () => {
                  const ok = await post("conversions", {
                    productId:
                      conversionDraft.productId === "none"
                        ? null
                        : conversionDraft.productId,
                    fromUnit: conversionDraft.fromUnit,
                    toUnit: conversionDraft.toUnit,
                    factor: Number(conversionDraft.factor),
                  });
                  if (ok) {
                    setConversionDraft({
                      productId: "none",
                      fromUnit: "",
                      toUnit: "",
                      factor: "",
                    });
                    router.refresh();
                  }
                }}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="max-h-80 overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Factor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversions.map((conversion) => (
                  <TableRow key={conversion.id}>
                    <TableCell>{conversion.productCode ?? "All products"}</TableCell>
                    <TableCell>{conversion.fromUnit}</TableCell>
                    <TableCell>{conversion.toUnit}</TableCell>
                    <TableCell className="tnum text-right">
                      {conversion.factor}
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

function TolerancePanel({
  settings,
  rules,
  suppliers,
  channels,
  productTypes,
}: {
  settings: ScmSettings;
  rules: ToleranceRow[];
  suppliers: SupplierRow[];
  channels: ChannelRow[];
  productTypes: string[];
}) {
  const router = useRouter();
  const [state, setState] = React.useState({
    qtyTolerancePct: String(settings.qtyTolerancePct),
    priceTolerancePct: String(settings.priceTolerancePct),
    deliveryWarningDays: String(settings.deliveryWarningDays),
    defaultStorageLocation: settings.defaultStorageLocation,
  });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/scm/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qtyTolerancePct: Number(state.qtyTolerancePct),
          priceTolerancePct: Number(state.priceTolerancePct),
          deliveryWarningDays: Number(state.deliveryWarningDays),
          defaultStorageLocation: state.defaultStorageLocation,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "The settings could not be saved.");
        return;
      }
      toast.success("Tolerances updated.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ToleranceRules
        rules={rules}
        suppliers={suppliers}
        channels={channels}
        productTypes={productTypes}
      />

    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fallback settings</CardTitle>
        <p className="text-sm text-muted-foreground">
          The fallback quantity and price tolerance when no rule above matches,
          plus the delivery warning window and the default storage location.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Quantity tolerance (%)"
            type="number"
            value={state.qtyTolerancePct}
            onChange={(v) => setState({ ...state, qtyTolerancePct: v })}
          />
          <Field
            label="Price tolerance (%)"
            type="number"
            value={state.priceTolerancePct}
            onChange={(v) => setState({ ...state, priceTolerancePct: v })}
          />
          <Field
            label="Delivery warning (days)"
            type="number"
            value={state.deliveryWarningDays}
            onChange={(v) => setState({ ...state, deliveryWarningDays: v })}
          />
          <Field
            label="Default storage location"
            value={state.defaultStorageLocation}
            onChange={(v) => setState({ ...state, defaultStorageLocation: v })}
          />
        </div>
        <Button variant="gold" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save settings
        </Button>
      </CardContent>
    </Card>
    </div>
  );
}

/**
 * §28 — tolerance rules by product type, supplier and business channel. The
 * most specific active rule wins: supplier, then channel, then product type,
 * then the global rule.
 */
function ToleranceRules({
  rules,
  suppliers,
  channels,
  productTypes,
}: {
  rules: ToleranceRow[];
  suppliers: SupplierRow[];
  channels: ChannelRow[];
  productTypes: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState({
    scope: "supplier",
    target: "",
    qty: "0",
    price: "0",
    weight: "0",
    note: "",
  });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const ok = await post("tolerances", {
      scope: draft.scope,
      supplierId: draft.scope === "supplier" ? draft.target : null,
      channelId: draft.scope === "channel" ? draft.target : null,
      productType: draft.scope === "product_type" ? draft.target : null,
      qtyTolerancePct: Number(draft.qty) || 0,
      priceTolerancePct: Number(draft.price) || 0,
      weightTolerancePct: Number(draft.weight) || 0,
      note: draft.note || null,
      active: true,
    });
    setBusy(false);
    if (ok) {
      setDraft({ scope: "supplier", target: "", qty: "0", price: "0", weight: "0", note: "" });
      router.refresh();
    }
  }

  const targets =
    draft.scope === "supplier"
      ? suppliers.map((entry) => ({ id: entry.id, label: entry.name }))
      : draft.scope === "channel"
        ? channels.map((entry) => ({ id: entry.id, label: `${entry.code} · ${entry.name}` }))
        : draft.scope === "product_type"
          ? productTypes.map((type) => ({ id: type, label: type }))
          : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tolerance rules</CardTitle>
        <p className="text-sm text-muted-foreground">
          A difference inside the tolerance is treated as a match and proceeds
          automatically. The most specific active rule wins:{" "}
          <span className="font-medium">
            supplier → channel → product type → global
          </span>
          .
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <div className="space-y-1.5">
            <Label htmlFor="tolerance-scope">Applies to</Label>
            <Select
              value={draft.scope}
              onValueChange={(value) => setDraft({ ...draft, scope: value, target: "" })}
            >
              <SelectTrigger id="tolerance-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Everything (global)</SelectItem>
                <SelectItem value="supplier">A supplier</SelectItem>
                <SelectItem value="channel">A business channel</SelectItem>
                <SelectItem value="product_type">A product type</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="tolerance-target">Target</Label>
            <Select
              value={draft.target}
              onValueChange={(value) => setDraft({ ...draft, target: value })}
              disabled={draft.scope === "global"}
            >
              <SelectTrigger id="tolerance-target">
                <SelectValue placeholder={draft.scope === "global" ? "—" : "Choose"} />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Qty %" type="number" value={draft.qty} onChange={(v) => setDraft({ ...draft, qty: v })} />
          <Field label="Price %" type="number" value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} />
          <Field label="Weight %" type="number" value={draft.weight} onChange={(v) => setDraft({ ...draft, weight: v })} />
          <div className="flex items-end">
            <Button
              onClick={save}
              disabled={busy || (draft.scope !== "global" && !draft.target)}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              Save rule
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applies to</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No rule yet — every difference is reviewed by a person.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="capitalize">
                      {rule.scope.replace("_", " ")}
                    </TableCell>
                    <TableCell className="font-medium">{rule.target}</TableCell>
                    <TableCell className="tnum text-right">
                      {rule.qtyTolerancePct}%
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {rule.priceTolerancePct}%
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {rule.weightTolerancePct}%
                    </TableCell>
                    <TableCell className="max-w-[20rem] text-xs text-muted-foreground">
                      {rule.note ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          rule.active
                            ? "text-xs text-success"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {rule.active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
