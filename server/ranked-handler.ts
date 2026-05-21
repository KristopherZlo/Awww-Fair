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
      json(response, 404, { error: "Unknown ranked route." });
    } catch {
      json(response, 500, { error: "Ranked server error." });
    }
  };
}
