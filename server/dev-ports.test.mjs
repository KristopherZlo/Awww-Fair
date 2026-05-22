import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findAvailablePort } from "./dev-ports.mjs";

const servers = [];

function listen(port = 0, host = "0.0.0.0") {
  const server = createServer();
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

describe("dev port selection", () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          })
      )
    );
  });

  it("skips occupied and reserved ports", async () => {
    const server = await listen();
    const occupiedPort = server.address().port;

    const selectedPort = await findAvailablePort(occupiedPort, new Set([occupiedPort + 1]));

    expect(selectedPort).not.toBe(occupiedPort);
    expect(selectedPort).not.toBe(occupiedPort + 1);
  });

  it("treats localhost-only listeners as occupied", async () => {
    const server = await listen(0, "127.0.0.1");
    const occupiedPort = server.address().port;

    const selectedPort = await findAvailablePort(occupiedPort);

    expect(selectedPort).not.toBe(occupiedPort);
  });
});
