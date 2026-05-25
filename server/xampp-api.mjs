import { applyXamppDefaults, assertXamppRuntimeSafe, loadXamppEnvFile } from "./xampp-env.mjs";

await loadXamppEnvFile();
applyXamppDefaults();
assertXamppRuntimeSafe();
await import("./lobby-server.ts");
