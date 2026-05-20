import type { LobbyResponse, LobbySession } from "./types";

export const LOBBY_API = "/api/lobbies";

export function lobbyAuthHeaders(session: Pick<LobbySession, "token">, headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${session.token}`
  };
}

export async function parseLobbyResponse<TState = LobbyResponse["state"]>(response: Response): Promise<LobbyResponse<TState>> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? "Стол недоступен");
  }
  return payload as LobbyResponse<TState>;
}
