/**
 * Apply the Prisma schema on boot (Railway etc.).
 *
 * `prisma db push` handles additive changes in place. When a change cannot be
 * applied in place, this stops and fails the deploy: the database holds what
 * DC2 is going to receive, so a boot script must never be the thing that drops
 * it. Fix the schema, or migrate the data deliberately.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
  { stdio: "inherit", env: process.env }
);

if (result.status === 0) {
  console.log("db-push: schema applied.");
} else {
  console.error(
    "db-push: the schema could not be applied to the existing database. " +
      "Nothing has been reset — the receiving data is untouched. " +
      "Apply the change with a migration, then deploy again."
  );
  process.exit(1);
}
