import { applyXamppDefaults, loadXamppEnvFile } from "./xampp-env.mjs";

await loadXamppEnvFile();
applyXamppDefaults();
await import("./lobby-server.ts");
