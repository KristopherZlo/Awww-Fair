import type { LobbyResponse, LobbySession } from "./types";
import { apiPath } from "./apiPath";

export const LOBBY_API = apiPath("lobbies");

export function lobbyAuthHeaders(session: Pick<LobbySession, "token">, headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${session.token}`
  };
}

export interface LobbyEventInput {
  eventType: string;
  payload?: unknown;
}

export async function parseLobbyResponse<TState = LobbyResponse["state"]>(response: Response): Promise<LobbyResponse<TState>> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? "Стол недоступен");
  }
  return payload as LobbyResponse<TState>;
}

export async function sendLobbyEvent<TState = LobbyResponse["state"]>(
  session: Pick<LobbySession, "code" | "playerId" | "token">,
  event: LobbyEventInput
): Promise<LobbyResponse<TState>> {
  return parseLobbyResponse<TState>(
    await fetch(`${LOBBY_API}/${session.code}/events`, {
      method: "POST",
      headers: lobbyAuthHeaders(session, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        playerId: session.playerId,
        eventType: event.eventType,
        payload: event.payload ?? {}
      })
    })
  );
}
