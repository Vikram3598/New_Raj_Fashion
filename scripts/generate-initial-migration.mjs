import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
const cli = resolve("node_modules/prisma/build/index.js");
const result = spawnSync(process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status ?? 1); }
const target = resolve("prisma/migrations/20261013_initial/migration.sql");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, result.stdout, "utf8");
process.stdout.write(`Wrote ${target}\n`);