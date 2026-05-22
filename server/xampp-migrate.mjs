import { applyXamppDefaults, loadXamppEnvFile } from "./xampp-env.mjs";
import { ensureMariaDbDatabase } from "./xampp-db.mjs";
import { readMariaDbConfig } from "./db.ts";

await loadXamppEnvFile();
applyXamppDefaults();
await ensureMariaDbDatabase(readMariaDbConfig(process.env));
await import("./migrate.ts");
