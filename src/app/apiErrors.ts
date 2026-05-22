const unavailableStatuses = new Set([502, 503, 504]);

export function apiErrorMessage(response: Response, fallback: string, serverLabel = "API server"): string {
  if (unavailableStatuses.has(response.status)) {
    return `${serverLabel} unavailable (HTTP ${response.status}). Start the full local server with npm run dev:lan.`;
  }

  return fallback;
}
