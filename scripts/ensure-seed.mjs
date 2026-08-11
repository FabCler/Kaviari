/**
 * First-boot seeding for hosted deployments (Railway etc.).
 * If the database has no products yet, run the demo seed once.
 * Subsequent restarts leave your data untouched.
 */
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const products = await prisma.product.count();
  if (products > 0) {
    console.log(`ensure-seed: database already has ${products} products — skipping seed.`);
  } else {
    console.log("ensure-seed: empty database — running demo seed…");
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
