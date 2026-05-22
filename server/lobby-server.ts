import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { advertisedLanUrls, listenHost, publicPath } from "./listen-config.mjs";
import { createAppHandler } from "./app-handler";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT ?? 5176);
const publicPort = Number(process.env.PUBLIC_PORT ?? port);
const appPath = publicPath(process.env);
const localAppUrl = `http://127.0.0.1:${publicPort}${appPath ? `/${appPath}` : ""}`;

const server = createServer(
  createAppHandler({
    distDir,
    env: process.env,
    publicPort
  })
);

server.listen(port, listenHost(), () => {
  const urls = advertisedLanUrls(process.env, publicPort);
  console.log(`Trend Market app: ${localAppUrl}`);
  urls.forEach((url) => console.log(`Trend Market LAN: ${url}`));
  if (publicPort !== port) {
    console.log(`Trend Market lobby API: http://127.0.0.1:${port}`);
  }
});
