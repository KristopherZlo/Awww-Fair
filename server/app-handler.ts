import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "mariadb";
import { createAuthHandler, MariaDbAuthStore, MemoryAuthStore, sessionTokenHash, type AuthStore, type AuthUser } from "./auth";
import { createDbPool } from "./db";
import { DEV_SEED_MATCH_LOGS, DEV_SEED_RATINGS } from "./dev-seed";
import { createLobbyHandler, type RequestHandler } from "./lobby-handler.mjs";
import { createRankedHandler } from "./ranked-handler";
import { MariaDbRankedStore, MemoryRankedStore, RankedService } from "./ranked";
import type { GameState } from "../src/app/types";
import { applyRankedReplayEvent } from "../src/game/rankedReplay";
import { buildInitialState } from "../src/game/session";
import { clampTurnTime, DEFAULT_TURN_TIME_SECONDS } from "../src/game/sessionConfig";

export interface AppHandlerOptions {
  env?: Partial<Record<string, string | undefined>>;
  authStore?: AuthStore;
  dbPool?: Pick<Pool, "query" | "getConnection">;
  fallbackHandler?: RequestHandler;
  rankedService?: RankedService;
  tokenFactory?: () => string;
  oauthStateFactory?: () => string;
  fetch?: typeof globalThis.fetch;
  distDir?: string;
  publicPort?: number;
}

function isAuthRoute(request: IncomingMessage) {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const parts = requestUrl.pathname.split("/").filter(Boolean);
  return parts[0] === "api" && parts[1] === "auth";
}

function isRankedRoute(request: IncomingMessage) {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const parts = requestUrl.pathname.split("/").filter(Boolean);
  return parts[0] === "api" && parts[1] === "ranked";
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  return (
    header
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}

async function currentUser(request: IncomingMessage, authStore: AuthStore): Promise<AuthUser | null> {
  const token = cookieValue(request, "tm_session");
  return token ? authStore.findUserBySessionHash(sessionTokenHash(token), new Date()) : null;
}

function createServerLobbyState(body: Record<string, unknown> = {}): GameState {
  const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};
  const turnTimeSeconds = clampTurnTime(Number(body.turnTimeSeconds ?? payload.turnTimeSeconds ?? DEFAULT_TURN_TIME_SECONDS));
  return {
    ...buildInitialState(true, turnTimeSeconds),
    phase: "planning"
  };
}

function applyServerLobbyEvent(state: GameState, event: { actorId: string; eventType: string; payload: unknown }): GameState {
  return applyRankedReplayEvent(state, event, { playerAId: "A", playerBId: "B" });
}

export function createAppHandler(options: AppHandlerOptions = {}): RequestHandler {
  const env = options.env ?? process.env;
  const useMemoryStore = env.DEV_MEMORY_STORE === "true";
  const dbPool = options.dbPool ?? (useMemoryStore ? null : createDbPool(env));
  const authStore = options.authStore ?? (useMemoryStore ? new MemoryAuthStore() : new MariaDbAuthStore(dbPool!));
  const authHandler = createAuthHandler({
    env,
    store: authStore,
    tokenFactory: options.tokenFactory,
    oauthStateFactory: options.oauthStateFactory,
    fetch: options.fetch
  });
  const rankedService =
    options.rankedService ??
    new RankedService({
      store: useMemoryStore ? new MemoryRankedStore(DEV_SEED_RATINGS, DEV_SEED_MATCH_LOGS) : new MariaDbRankedStore(dbPool!)
    });
  const rankedHandler = createRankedHandler({ authStore, service: rankedService });
  const fallbackHandler =
    options.fallbackHandler ??
    createLobbyHandler({
      env,
      distDir: options.distDir,
      publicPort: options.publicPort,
      requireAuth: true,
      authenticateRequest: async (request: IncomingMessage) => {
        const user = await currentUser(request, authStore);
        return user && !user.deactivatedAt ? { id: user.id } : null;
      },
      initialStateFactory: createServerLobbyState,
      applyEvent: applyServerLobbyEvent
    });

  return async function appHandler(request: IncomingMessage, response: ServerResponse) {
    if (isAuthRoute(request)) {
      await authHandler(request, response);
      return;
    }
    if (isRankedRoute(request)) {
      await rankedHandler(request, response);
      return;
    }
    await fallbackHandler(request, response);
  };
}
