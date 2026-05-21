import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "mariadb";
import { createAuthHandler, MariaDbAuthStore, type AuthStore } from "./auth";
import { createDbPool } from "./db";
import { createLobbyHandler, type RequestHandler } from "./lobby-handler.mjs";
import { createRankedHandler } from "./ranked-handler";
import { MariaDbRankedStore, RankedService } from "./ranked";

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

export function createAppHandler(options: AppHandlerOptions = {}): RequestHandler {
  const env = options.env ?? process.env;
  const dbPool = options.dbPool ?? createDbPool(env);
  const authStore = options.authStore ?? new MariaDbAuthStore(dbPool);
  const authHandler = createAuthHandler({
    env,
    store: authStore,
    tokenFactory: options.tokenFactory,
    oauthStateFactory: options.oauthStateFactory,
    fetch: options.fetch
  });
  const rankedService = options.rankedService ?? new RankedService({ store: new MariaDbRankedStore(dbPool) });
  const rankedHandler = createRankedHandler({ authStore, service: rankedService });
  const fallbackHandler =
    options.fallbackHandler ??
    createLobbyHandler({
      env,
      distDir: options.distDir,
      publicPort: options.publicPort
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
