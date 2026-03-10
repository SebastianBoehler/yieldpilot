import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const packageRunner = process.versions.bun ? "bunx" : "npx";

if (!databaseUrl.startsWith("file:")) {
  execFileSync(packageRunner, ["prisma", "db", "push"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
  process.exit(0);
}

const [rawPath] = databaseUrl.slice("file:".length).split("?");
const dbPath = path.isAbsolute(rawPath)
  ? rawPath
  : path.resolve(process.cwd(), "prisma", rawPath.replace(/^\.\//, ""));

mkdirSync(path.dirname(dbPath), { recursive: true });
closeSync(openSync(dbPath, "a"));

const sql = execFileSync(
  packageRunner,
  [
    "prisma",
    "migrate",
    "diff",
    "--from-url",
    `file:${dbPath}`,
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script",
  ],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);

if (sql.trim()) {
  execFileSync("sqlite3", [dbPath], {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

console.log(`SQLite schema synced at ${dbPath}`);
