import { describe, expect, it } from "vitest";
import { applyEnvValues, applyXamppDefaults, assertXamppRuntimeSafe, parseEnvFile } from "./xampp-env.mjs";

describe("XAMPP environment helpers", () => {
  it("parses env files with comments, whitespace, and quoted values", () => {
    expect(
      parseEnvFile(`
        # Local XAMPP settings
        MARIADB_USER = root
        MARIADB_PASSWORD = "secret value"
        PUBLIC_PATH='trendmarket'

        INVALID LINE
      `)
    ).toEqual({
      MARIADB_USER: "root",
      MARIADB_PASSWORD: "secret value",
      PUBLIC_PATH: "trendmarket"
    });
  });

  it("applies file values without overwriting existing process env values", () => {
    const env = { MARIADB_USER: "admin" };

    applyEnvValues(env, {
      MARIADB_USER: "root",
      MARIADB_DATABASE: "trend_market"
    });

    expect(env).toEqual({
      MARIADB_USER: "admin",
      MARIADB_DATABASE: "trend_market"
    });
  });

  it("applies XAMPP defaults for Apache proxy and MariaDB persistence", () => {
    const env = {};

    applyXamppDefaults(env);

    expect(env).toMatchObject({
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
    });
  });

  it("accepts XAMPP runtime defaults as safe", () => {
    const env = {};

    applyXamppDefaults(env);

    expect(() => assertXamppRuntimeSafe(env)).not.toThrow();
  });

  it("fails closed when dangerous dev runtime flags are enabled for XAMPP", () => {
    for (const flag of ["AUTH_DEV_LOGIN", "DEV_MEMORY_STORE", "LOBBY_TRUST_CLIENT_STATE"]) {
      const env = {};
      applyXamppDefaults(env);
      env[flag] = "true";

      expect(() => assertXamppRuntimeSafe(env)).toThrow(`${flag}=true`);
    }
  });

  it("allows dangerous XAMPP dev flags only behind the explicit local override", () => {
    const env = {};
    applyXamppDefaults(env);
    env.AUTH_DEV_LOGIN = "true";
    env.XAMPP_ALLOW_UNSAFE_DEV_FLAGS = "true";

    expect(() => assertXamppRuntimeSafe(env)).not.toThrow();
  });
});
