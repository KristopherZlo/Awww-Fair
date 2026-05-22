import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findAvailablePort } from "./dev-ports.mjs";
import { lanUrls } from "./network-info.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const requestedAppPort = Number(process.env.APP_PORT ?? 5175);
const requestedLobbyPort = Number(process.env.LOBBY_PORT ?? 5176);
const appPort = await findAvailablePort(requestedAppPort, new Set([requestedLobbyPort]));
const lobbyPort = await findAvailablePort(requestedLobbyPort, new Set([appPort]));
const hasMariaDbEnv = ["MARIADB_HOST", "MARIADB_PORT", "MARIADB_USER", "MARIADB_PASSWORD", "MARIADB_DATABASE"].some((key) => process.env[key]);
const devMemoryStore = process.env.DEV_MEMORY_STORE ?? (hasMariaDbEnv ? "false" : "true");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const tsxBin = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const children = new Set();
let shuttingDown = false;

function start(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true
  });

  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`${label} stopped${signal ? ` by ${signal}` : ""}.`);
      stop(code ?? 1);
    }
  });
}

function stop(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
  setTimeout(() => process.exit(code), 600).unref();
}

console.log("Trend Market LAN dev mode");
if (appPort !== requestedAppPort) {
  console.log(`Port ${requestedAppPort} is busy. Using ${appPort} for Vite.`);
}
if (lobbyPort !== requestedLobbyPort) {
  console.log(`Port ${requestedLobbyPort} is busy. Using ${lobbyPort} for the lobby API.`);
}
console.log(`Local: http://127.0.0.1:${appPort}`);
for (const url of lanUrls(appPort)) {
  console.log(`Network: ${url}`);
}
console.log("Share one Network address with the other player, then create a lobby in the menu.");
if (devMemoryStore === "true") {
  console.log("Dev auth and ranked data are stored in memory. Set MARIADB_* env vars for persistent ranked data.");
}

start("Lobby server", process.execPath, [tsxBin, "server/lobby-server.ts"], {
  AUTH_DEV_LOGIN: process.env.AUTH_DEV_LOGIN ?? "true",
  DEV_MEMORY_STORE: devMemoryStore,
  PORT: String(lobbyPort),
  PUBLIC_PORT: String(appPort)
});
start("Vite dev server", process.execPath, [viteBin, "--host", "0.0.0.0", "--port", String(appPort), "--strictPort"], {
  LOBBY_PORT: String(lobbyPort)
});

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
