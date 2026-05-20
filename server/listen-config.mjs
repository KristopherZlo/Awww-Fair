export function listenHost(env = process.env) {
  return env.HOST || "0.0.0.0";
}

export function advertisedUrls(env = process.env, fallbackUrls = []) {
  const publicUrl = env.PUBLIC_URL?.trim();
  return publicUrl ? [publicUrl.replace(/\/+$/, "")] : fallbackUrls;
}
