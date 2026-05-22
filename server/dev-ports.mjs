import { createServer } from "node:net";

const listenHosts = ["0.0.0.0", "127.0.0.1"];

function canListen(port, host = "0.0.0.0") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function canListenOnAllHosts(port) {
  for (const host of listenHosts) {
    if (!(await canListen(port, host))) {
      return false;
    }
  }
  return true;
}

export async function findAvailablePort(startPort, reserved = new Set()) {
  for (let port = Number(startPort); port <= 65535; port += 1) {
    if (!reserved.has(port) && (await canListenOnAllHosts(port))) {
      return port;
    }
  }

  throw new Error(`No available port found from ${startPort}.`);
}
