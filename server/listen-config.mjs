import { lanUrls } from "./network-info.mjs";

export function listenHost(env = process.env) {
  return env.HOST || "0.0.0.0";
}

export function publicPath(env = process.env) {
  return String(env.PUBLIC_PATH ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

export function advertisedUrls(env = process.env, fallbackUrls = []) {
  const publicUrl = env.PUBLIC_URL?.trim();
  return publicUrl ? [publicUrl.replace(/\/+$/, "")] : fallbackUrls;
}

export function advertisedLanUrls(env = process.env, port, options = {}) {
  return advertisedUrls(env, lanUrls(port, { ...options, path: publicPath(env) }));
}
