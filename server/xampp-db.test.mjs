import { describe, expect, it } from "vitest";
import { createDatabaseStatement, databaseBootstrapConfig, ensureMariaDbDatabase } from "./xampp-db.mjs";

describe("XAMPP MariaDB bootstrap", () => {
  it("builds a bootstrap connection config without selecting the app database", () => {
    expect(
      databaseBootstrapConfig({
        host: "127.0.0.1",
        port: 3306,
        user: "root",
        password: "",
        database: "trend_market",
        connectionLimit: 5
      })
    ).toEqual({
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      password: "",
      connectionLimit: 1
    });
  });

  it("creates a safe CREATE DATABASE statement for the configured database", () => {
    expect(createDatabaseStatement("trend_market")).toBe(
      "CREATE DATABASE IF NOT EXISTS `trend_market` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    );
    expect(createDatabaseStatement("trend`market")).toBe(
      "CREATE DATABASE IF NOT EXISTS `trend``market` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    );
  });

  it("uses bootstrap config, creates the database, and closes the pool", async () => {
    const calls = [];

    await ensureMariaDbDatabase(
      {
        host: "127.0.0.1",
        port: 3306,
        user: "root",
        password: "",
        database: "trend_market",
        connectionLimit: 5
      },
      (poolConfig) => ({
        query: async (sql) => calls.push({ poolConfig, sql }),
        end: async () => calls.push("end")
      })
    );

    expect(calls).toEqual([
      {
        poolConfig: {
          host: "127.0.0.1",
          port: 3306,
          user: "root",
          password: "",
          connectionLimit: 1
        },
        sql: "CREATE DATABASE IF NOT EXISTS `trend_market` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
      },
      "end"
    ]);
  });
});
