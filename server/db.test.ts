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
    expect(sql).toContain("ranked_leave_count INT NOT NULL DEFAULT 0");
    expect(sql).toContain("ranked_clean_games_since_leave INT NOT NULL DEFAULT 0");
    expect(sql).toContain("ranked_cooldown_until DATETIME(3) NULL");
    expect(sql).toContain("is_bot BOOLEAN NOT NULL DEFAULT FALSE");
    expect(sql).toContain("deactivated_at DATETIME(3) NULL");
    expect(sql).toContain("delete_after DATETIME(3) NULL");
    expect(sql).toContain("rating_games INT NOT NULL DEFAULT 0");
    expect(sql).toContain("calibration_games INT NOT NULL DEFAULT 0");
    expect(sql).toContain("bot_match_at DATETIME(3) NULL");
    expect(sql).toContain("is_calibration BOOLEAN NOT NULL DEFAULT FALSE");
    expect(sql).toContain("is_bot_match BOOLEAN NOT NULL DEFAULT FALSE");
  });

  it("seeds the player test account with ranked matches and leaderboard rows", () => {
    const sql = createMigrationStatements().join("\n");

    expect(sql).toContain("'dev-player', 'player'");
    expect(sql).toContain("'seed-mira', 'Mira'");
    expect(sql).toContain("'seed-player-match-1'");
    expect(sql).toContain("'seed-player-match-2'");
    expect(sql).toContain("'seed-player-match-3'");
    expect(sql).toContain("ranked_games, rating_games, calibration_games, wins, losses");
  });
});
