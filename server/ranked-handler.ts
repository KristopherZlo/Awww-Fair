import type { IncomingMessage, ServerResponse } from "node:http";
import { sessionTokenHash, type AuthStore, type AuthUser } from "./auth";
import { RankedCooldownError, type RankedService } from "./ranked";
import { securityHeaders } from "./security-headers.mjs";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { ...securityHeaders(), "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

class RankedHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;
}

async function currentUser(request: IncomingMessage, authStore: AuthStore): Promise<AuthUser | null> {
  const token = cookieValue(request, "tm_session");
  return token ? authStore.findUserBySessionHash(sessionTokenHash(token), new Date()) : null;
}

async function readJson(request: IncomingMessage, maxBodyBytes = DEFAULT_MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) {
      throw new RankedHttpError(413, "Request body too large.");
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new RankedHttpError(400, "Malformed JSON.");
  }
}

function numberField(body: Record<string, unknown>, name: string): number {
  const value = Number(body[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function rankedErrorResponse(error: unknown): { status: number; body: { error: string; penalty?: unknown } } {
  if (error instanceof RankedHttpError) {
    return { status: error.status, body: { error: error.message } };
  }
  if (error instanceof Error && error.message === "Ranked cooldown is active.") {
    return {
      status: 429,
      body: {
        error: error.message,
        ...(error instanceof RankedCooldownError ? { penalty: error.penalty } : {})
      }
    };
  }
  if (
    error instanceof Error &&
    (error.message === "Ranked replay result mismatch." ||
      error.message === "Ranked replay is incomplete." ||
      error.message === "Ranked replay did not reach game end.")
  ) {
    return { status: 409, body: { error: error.message } };
  }
  return { status: 500, body: { error: "Ranked server error." } };
}

export function createRankedHandler({
  authStore,
  service,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES
}: {
  authStore: AuthStore;
  service: RankedService;
  maxBodyBytes?: number;
}) {
  return async function rankedHandler(request: IncomingMessage, response: ServerResponse) {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const parts = requestUrl.pathname.split("/").filter(Boolean);
    if (request.method === "GET" && parts[2] === "leaderboard") {
      json(response, 200, await service.leaderboard({
        page: Number(requestUrl.searchParams.get("page") ?? 1),
        pageSize: Number(requestUrl.searchParams.get("pageSize") ?? 25),
        search: requestUrl.searchParams.get("search") ?? ""
      }));
      return;
    }

    const user = await currentUser(request, authStore);
    if (!user) {
      json(response, 401, { error: "Login is required for ranked." });
      return;
    }
    if (user.deactivatedAt) {
      json(response, 403, { error: "Profile is scheduled for deletion." });
      return;
    }

    try {
      if (request.method === "POST" && parts[2] === "queue") {
        json(response, 200, await service.joinQueue(user.id));
        return;
      }
      if (request.method === "DELETE" && parts[2] === "queue") {
        await service.cancelQueue(user.id);
        json(response, 200, { status: "idle" });
        return;
      }
      if (request.method === "GET" && parts[2] === "status") {
        json(response, 200, await service.statusForPlayer(user.id));
        return;
      }
      if (request.method === "GET" && parts[2] === "rating") {
        json(response, 200, { rating: await service.publicRatingForPlayer(user.id) });
        return;
      }
      if (request.method === "GET" && parts[2] === "history") {
        json(response, 200, { history: await service.matchHistoryForPlayer(user.id, Number(requestUrl.searchParams.get("limit") ?? 20)) });
        return;
      }
      if (request.method === "GET" && parts[2] === "events") {
        const afterSequence = Number(requestUrl.searchParams.get("after") ?? 0);
        if (!Number.isFinite(afterSequence)) {
          throw new Error("Invalid after.");
        }
        json(response, 200, { events: await service.eventsForPlayer(user.id, requestUrl.searchParams.get("matchId") ?? "", afterSequence) });
        return;
      }
      if (request.method === "POST" && parts[2] === "events") {
        const body = await readJson(request, maxBodyBytes);
        const event = await service.recordEvent(user.id, {
          matchId: String(body.matchId ?? ""),
          round: numberField(body, "round"),
          phase: String(body.phase ?? ""),
          eventType: String(body.eventType ?? ""),
          payload: body.payload ?? {}
        });
        json(response, 200, { event });
        return;
      }
      if (request.method === "POST" && parts[2] === "disconnect") {
        const body = await readJson(request, maxBodyBytes);
        json(response, 200, await service.disconnectFromMatch(user.id, String(body.matchId ?? "")));
        return;
      }
      if (request.method === "POST" && parts[2] === "abandon") {
        const body = await readJson(request, maxBodyBytes);
        json(response, 200, await service.abandonMatch(user.id, String(body.matchId ?? "")));
        return;
      }
      if (request.method === "POST" && parts[2] === "reconnect") {
        const body = await readJson(request, maxBodyBytes);
        json(response, 200, await service.reconnectToMatch(user.id, String(body.matchId ?? "")));
        return;
      }
      if (request.method === "POST" && parts[2] === "settle") {
        const body = await readJson(request, maxBodyBytes);
        json(
          response,
          200,
          await service.settleMatch(user.id, {
            matchId: String(body.matchId ?? ""),
            playerACoins: numberField(body, "playerACoins"),
            playerBCoins: numberField(body, "playerBCoins"),
            playerASales: numberField(body, "playerASales"),
            playerBSales: numberField(body, "playerBSales")
          })
        );
        return;
      }
      json(response, 404, { error: "Unknown ranked route." });
    } catch (error) {
      const errorResponse = rankedErrorResponse(error);
      json(response, errorResponse.status, errorResponse.body);
    }
  };
}
