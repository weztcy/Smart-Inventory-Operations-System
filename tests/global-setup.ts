import { execSync } from "node:child_process";

/** Reset test.db (SQLite) sebelum suite integrasi berjalan. */
export default function setup() {
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}
