import { describe, expect, it } from "vitest";
import { createMigrationStatements, readMariaDbConfig } from "./db";

describe("MariaDB server database setup", () => {
  it("reads MariaDB connection settings from environment values", () => {
    expect(
      readMariaDbConfig({
        MARIADB_HOST: "db.local",
        MARIADB_PORT: "3307",
        MARIADB_USER: "trend",
        MARIADB_PASSWORD: "secret",
        MARIADB_DATABASE: "trend_market",
        MARIADB_CONNECTION_LIMIT: "8"
      })
    ).toEqual({
      host: "db.local",
      port: 3307,
      user: "trend",
      password: "secret",
      database: "trend_market",
      connectionLimit: 8
    });
  });

  it("creates migrations for accounts, ratings, ranked matches, and turn events", () => {
    const sql = createMigrationStatements().join("\n");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS oauth_accounts");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS user_sessions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS player_ratings");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS ranked_matches");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS ranked_queue");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS ranked_match_events");
    expect(sql).toContain("seed VARCHAR(128) NOT NULL");
    expect(sql).toContain("initial_state JSON NOT NULL");
    expect(sql).toContain("player_a_disconnected_at DATETIME(3) NULL");
    expect(sql).toContain("player_b_disconnected_at DATETIME(3) NULL");
  });
});
