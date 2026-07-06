const unavailableStatuses = new Set([502, 503, 504]);

interface ApiErrorMessageOptions {
  pathname?: string;
}

function currentPathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function isXamppPublicPath(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] === "trendmarket";
}

export function apiErrorMessage(response: Response, fallback: string, serverLabel = "API server", options: ApiErrorMessageOptions = {}): string {
  if (unavailableStatuses.has(response.status)) {
    if (isXamppPublicPath(options.pathname ?? currentPathname())) {
      return `${serverLabel} unavailable (HTTP ${response.status}). Apache is serving the app, but the Node API is not responding. Start it with npm run xampp:api and keep that terminal open.`;
    }
    return `${serverLabel} unavailable (HTTP ${response.status}). Start the full local server with npm run lan.`;
  }

  return fallback;
}
