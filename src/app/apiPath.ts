export interface ApiPathOptions {
  baseUrl?: string;
  pathname?: string;
}

function currentBaseUrl() {
  return import.meta.env.BASE_URL || "/";
}

function currentPathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function normalizeApiSuffix(path: string) {
  return path.replace(/^\/+/, "").replace(/^api\/+/, "");
}

function directoryPath(pathname: string) {
  const cleanPath = (pathname || "/").split(/[?#]/)[0] || "/";
  const directory = cleanPath.endsWith("/") ? cleanPath : cleanPath.slice(0, cleanPath.lastIndexOf("/") + 1) || "/";
  return directory === "/" ? "" : directory.replace(/\/+$/, "");
}

function basePath(options: ApiPathOptions = {}) {
  const baseUrl = (options.baseUrl ?? currentBaseUrl()).trim();
  const pathname = options.pathname ?? currentPathname();

  if (!baseUrl || baseUrl === "." || baseUrl === "./") {
    return directoryPath(pathname);
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(baseUrl)) {
    return directoryPath(new URL(baseUrl).pathname || pathname);
  }

  if (baseUrl.startsWith("/")) {
    return baseUrl === "/" ? "" : baseUrl.replace(/\/+$/, "");
  }

  return `/${baseUrl.replace(/^\/+|\/+$/g, "")}`;
}

export function apiPath(path: string, options: ApiPathOptions = {}) {
  const prefix = basePath(options);
  const suffix = normalizeApiSuffix(path);
  return `${prefix}/api/${suffix}`.replace(/\/{2,}/g, "/");
}

export function normalizeApiAssetUrl(url: string | null, options: ApiPathOptions = {}) {
  if (!url?.startsWith("/api/")) {
    return url;
  }
  return apiPath(url, options);
}
