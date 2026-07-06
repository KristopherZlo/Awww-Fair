import { readFile } from "node:fs/promises";
import path from "node:path";

export const XAMPP_DEFAULT_ENV = {
  AUTH_DEV_LOGIN: "false",
  DEV_MEMORY_STORE: "false",
  HOST: "127.0.0.1",
  MARIADB_DATABASE: "trend_market",
  MARIADB_HOST: "127.0.0.1",
  MARIADB_PASSWORD: "",
  MARIADB_PORT: "3306",
  MARIADB_USER: "root",
  PORT: "5176",
  PUBLIC_PATH: "trendmarket",
  PUBLIC_PORT: "80"
};

const XAMPP_FORBIDDEN_RUNTIME_FLAGS = ["AUTH_DEV_LOGIN", "DEV_MEMORY_STORE"];

export function parseEnvFile(content) {
  const values = {};

  for (const rawLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    let value = match[2].trim();
    const quote = value[0];
    if ((quote === `"` || quote === `'`) && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    values[match[1]] = value;
  }

  return values;
}

export function applyEnvValues(env, values) {
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
  return env;
}

export function applyXamppDefaults(env = process.env) {
  return applyEnvValues(env, XAMPP_DEFAULT_ENV);
}

export function assertXamppRuntimeSafe(env = process.env) {
  if (String(env.XAMPP_ALLOW_UNSAFE_DEV_FLAGS ?? "").trim().toLowerCase() === "true") {
    return env;
  }

  const enabledFlags = XAMPP_FORBIDDEN_RUNTIME_FLAGS.filter((flag) => String(env[flag] ?? "").trim().toLowerCase() === "true");
  if (enabledFlags.length) {
    throw new Error(`Unsafe XAMPP runtime configuration: ${enabledFlags.map((flag) => `${flag}=true`).join(", ")}.`);
  }
  return env;
}

export async function loadXamppEnvFile(filePath = path.resolve(".env.xampp"), env = process.env) {
  try {
    applyEnvValues(env, parseEnvFile(await readFile(filePath, "utf8")));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
