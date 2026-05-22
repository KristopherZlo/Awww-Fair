import { describe, expect, it } from "vitest";
import { applyEnvValues, applyXamppDefaults, parseEnvFile } from "./xampp-env.mjs";

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
      AUTH_DEV_LOGIN: "true",
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
});
