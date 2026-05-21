import type { IncomingMessage, ServerResponse } from "node:http";
import { sessionTokenHash, type AuthStore, type AuthUser } from "./auth";
import type { RankedService } from "./ranked";

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
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

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function numberField(body: Record<string, unknown>, name: string): number {
  const value = Number(body[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

export function createRankedHandler({ authStore, service }: { authStore: AuthStore; service: RankedService }) {
  return async function rankedHandler(request: IncomingMessage, response: ServerResponse) {
    const user = await currentUser(request, authStore);
    if (!user) {
      json(response, 401, { error: "Login is required for ranked." });
      return;
    }

    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const parts = requestUrl.pathname.split("/").filter(Boolean);
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
      if (request.method === "POST" && parts[2] === "events") {
        const body = await readJson(request);
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
      if (request.method === "POST" && parts[2] === "settle") {
        const body = await readJson(request);
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
    } catch {
      json(response, 500, { error: "Ranked server error." });
    }
  };
}
