import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "mariadb";
import { createAuthHandler, MariaDbAuthStore, type AuthStore } from "./auth";
import { createDbPool } from "./db";
import { createLobbyHandler, type RequestHandler } from "./lobby-handler.mjs";

export interface AppHandlerOptions {
  env?: Partial<Record<string, string | undefined>>;
  authStore?: AuthStore;
  dbPool?: Pick<Pool, "query">;
  fallbackHandler?: RequestHandler;
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

export function createAppHandler(options: AppHandlerOptions = {}): RequestHandler {
  const env = options.env ?? process.env;
  const authStore = options.authStore ?? new MariaDbAuthStore(options.dbPool ?? createDbPool(env));
  const authHandler = createAuthHandler({
    env,
    store: authStore,
    tokenFactory: options.tokenFactory,
    oauthStateFactory: options.oauthStateFactory,
    fetch: options.fetch
  });
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
    await fallbackHandler(request, response);
  };
}
