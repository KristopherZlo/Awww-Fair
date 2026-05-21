import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { sessionTokenHash, type AuthStore, type AuthUser } from "./auth";
import { createRankedHandler } from "./ranked-handler";
import { MemoryRankedStore, RankedService } from "./ranked";

async function startTestServer(handler: ReturnType<typeof createRankedHandler>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function authStore(user: AuthUser): AuthStore {
  return {
    async findUserBySessionHash(tokenHash) {
      return tokenHash === sessionTokenHash("token") ? user : null;
    },
    async createDevUser() {
      return user;
    },
    async upsertOAuthUser() {
      return user;
    },
    async createSession() {},
    async deleteSession() {}
  };
}

describe("ranked handler", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("rejects unauthenticated ranked queue access", async () => {
    const service = new RankedService({ store: new MemoryRankedStore() });
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const response = await fetch(`${server.url}/api/ranked/queue`, { method: "POST" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Login is required for ranked." });
  });

  it("queues an authenticated player and exposes queue status", async () => {
    const store = new MemoryRankedStore([{ playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }]);
    const service = new RankedService({ store, now: () => 1_000 });
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const queued = await fetch(`${server.url}/api/ranked/queue`, { method: "POST", headers: { Cookie: "tm_session=token" } });
    const status = await fetch(`${server.url}/api/ranked/status`, { headers: { Cookie: "tm_session=token" } });

    expect(await queued.json()).toEqual({ status: "waiting" });
    expect(await status.json()).toEqual({ status: "waiting" });
  });

  it("records ranked events and settles the current match", async () => {
    const store = new MemoryRankedStore([
      { playerId: "a", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null },
      { playerId: "b", mmr: 1500, rankedGames: 0, wins: 0, losses: 0, lastRankedAt: null }
    ]);
    const service = new RankedService({ store, now: () => 1_000, idFactory: () => "match-1", seedFactory: () => "seed-1" });
    await service.joinQueue("a");
    await service.joinQueue("b");
    const server = await startTestServer(createRankedHandler({ authStore: authStore({ id: "a", displayName: "A", avatarUrl: null, email: null }), service }));
    cleanups.push(server.close);

    const event = await fetch(`${server.url}/api/ranked/events`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1", round: 1, phase: "planning", eventType: "place_product", payload: { slotIndex: 0 } })
    });
    const settlement = await fetch(`${server.url}/api/ranked/settle`, {
      method: "POST",
      headers: { Cookie: "tm_session=token", "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1", playerACoins: 10, playerBCoins: 5, playerASales: 4, playerBSales: 2 })
    });

    expect(await event.json()).toMatchObject({ event: { sequence: 1, eventType: "place_product" } });
    expect(await settlement.json()).toMatchObject({ log: { winnerId: "a", mmrChange: 26 } });
  });
});
