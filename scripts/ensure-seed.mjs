/**
 * First-boot / upgrade seeding for hosted deployments (Railway etc.).
 * Seeds when the database is empty OR when the catalog generation is older
 * than the one shipped with this build (user accounts are preserved by the
 * seed itself). Otherwise leaves data untouched.
 */
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const CATALOG_VERSION = 3;

const prisma = new PrismaClient();

try {
  const products = await prisma.product.count();
  const versionRow = await prisma.setting.findUnique({
    where: { key: "catalogVersion" },
  });
  const version = Number(versionRow?.value ?? 0);

  if (products > 0 && version >= CATALOG_VERSION) {
    console.log(
      `ensure-seed: database has ${products} products at catalog v${version} — skipping seed.`
    );
  } else {
    console.log(
      products === 0
        ? "ensure-seed: empty database — running demo seed…"
        : `ensure-seed: catalog v${version} < v${CATALOG_VERSION} — reseeding (user accounts kept)…`
    );
    const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      console.error("ensure-seed: seed failed");
      process.exit(result.status ?? 1);
    }
  }
} finally {
  await prisma.$disconnect();
}
