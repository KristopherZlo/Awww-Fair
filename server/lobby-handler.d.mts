import type { IncomingMessage, ServerResponse } from "node:http";

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

export function createLobbyHandler(options?: Record<string, unknown>): RequestHandler;
