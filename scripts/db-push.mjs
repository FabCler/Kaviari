/**
 * Apply the Prisma schema on boot (Railway etc.).
 *
 * Normal path: `prisma db push --accept-data-loss` handles additive changes
 * and column drops. If the push is UNEXECUTABLE (e.g. a required column was
 * added to a non-empty table — the v1 → v2 upgrade), fall back to a full
 * reset: the catalog is reseeded right after by ensure-seed.mjs, so the only
 * thing a reset can lose is data written under an incompatible old schema.
 */
import { spawnSync } from "node:child_process";

function push(args) {
  const result = spawnSync(
    "npx",
    ["prisma", "db", "push", "--skip-generate", ...args],
    { stdio: "inherit", env: process.env }
  );
  return result.status === 0;
}

if (push(["--accept-data-loss"])) {
  console.log("db-push: schema applied.");
} else {
  console.warn(
    "db-push: schema change cannot be applied in place — resetting the database (it will be reseeded on this boot)."
  );
  if (!push(["--force-reset", "--accept-data-loss"])) {
    console.error("db-push: reset failed.");
    process.exit(1);
  }
  console.log("db-push: database reset and schema applied.");
}
