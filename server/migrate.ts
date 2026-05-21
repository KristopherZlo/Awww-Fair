import { createDbPool, runMigrations } from "./db";

const pool = createDbPool();

try {
  await runMigrations(pool);
  console.log("MariaDB migrations applied.");
} finally {
  await pool.end();
}
