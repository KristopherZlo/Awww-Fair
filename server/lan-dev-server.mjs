import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lanUrls } from "./network-info.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appPort = Number(process.env.APP_PORT ?? 5175);
const lobbyPort = Number(process.env.LOBBY_PORT ?? 5176);
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
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
console.log(`Local: http://127.0.0.1:${appPort}`);
for (const url of lanUrls(appPort)) {
  console.log(`Network: ${url}`);
}
console.log("Share one Network address with the other player, then create a lobby in the menu.");

start("Lobby server", process.execPath, ["server/lobby-server.mjs"], {
  PORT: String(lobbyPort),
  PUBLIC_PORT: String(appPort)
});
start("Vite dev server", process.execPath, [viteBin, "--host", "0.0.0.0", "--port", String(appPort)]);

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
