import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAppHandler } from "./app-handler";
import type { AuthStore } from "./auth";

async function startTestServer(handler: ReturnType<typeof createAppHandler>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function store(): AuthStore {
  return {
    async findUserBySessionHash() {
      return null;
    },
    async createDevUser() {
      return { id: "dev", displayName: "Dev", avatarUrl: null, email: null };
    },
    async upsertOAuthUser() {
      return { id: "oauth", displayName: "OAuth", avatarUrl: null, email: null };
    },
    async createSession() {},
    async deleteSession() {}
  };
}

describe("app handler", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("routes auth API requests before falling back to the lobby handler", async () => {
    let fallbackCalled = false;
    const server = await startTestServer(
      createAppHandler({
        env: { AUTH_DEV_LOGIN: "true" },
        authStore: store(),
        tokenFactory: () => "token",
        fallbackHandler: (_request: IncomingMessage, response: ServerResponse) => {
          fallbackCalled = true;
          response.writeHead(204);
          response.end();
        }
      })
    );
    cleanups.push(server.close);

    const auth = await fetch(`${server.url}/api/auth/dev-login`, { method: "POST", body: JSON.stringify({ displayName: "Dev" }) });
    const lobby = await fetch(`${server.url}/api/lobbies`);

    expect(auth.status).toBe(200);
    expect(fallbackCalled).toBe(true);
    expect(lobby.status).toBe(204);
  });
});
