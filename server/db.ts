import { createPool, type Pool, type PoolConfig } from "mariadb";

export type DbEnv = Partial<Record<string, string | undefined>>;

export function readMariaDbConfig(env: DbEnv = process.env): PoolConfig {
  return {
    host: env.MARIADB_HOST ?? "127.0.0.1",
    port: Number(env.MARIADB_PORT ?? 3306),
    user: env.MARIADB_USER ?? "root",
    password: env.MARIADB_PASSWORD ?? "",
    database: env.MARIADB_DATABASE ?? "trend_market",
    connectionLimit: Number(env.MARIADB_CONNECTION_LIMIT ?? 5)
  };
}

export function createDbPool(env: DbEnv = process.env): Pool {
  return createPool(readMariaDbConfig(env));
}

export function createMigrationStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY,
      display_name VARCHAR(80) NOT NULL,
      avatar_url VARCHAR(512) NULL,
      email VARCHAR(255) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )`,
    `CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider VARCHAR(24) NOT NULL,
      provider_user_id VARCHAR(128) NOT NULL,
      user_id CHAR(36) NOT NULL,
      email VARCHAR(255) NULL,
      display_name VARCHAR(80) NOT NULL,
      avatar_url VARCHAR(512) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (provider, provider_user_id),
      CONSTRAINT fk_oauth_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS player_ratings (
      player_id CHAR(36) PRIMARY KEY,
      mmr INT NOT NULL DEFAULT 1500,
      ranked_games INT NOT NULL DEFAULT 0,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      last_ranked_at DATETIME(3) NULL,
      CONSTRAINT fk_player_ratings_user FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ranked_matches (
      id CHAR(36) PRIMARY KEY,
      player_a_id CHAR(36) NOT NULL,
      player_b_id CHAR(36) NOT NULL,
      winner_id CHAR(36) NULL,
      loser_id CHAR(36) NULL,
      player_a_coins INT NULL,
      player_b_coins INT NULL,
      player_a_sales INT NULL,
      player_b_sales INT NULL,
      player_a_mmr_before INT NOT NULL,
      player_b_mmr_before INT NOT NULL,
      player_a_mmr_after INT NULL,
      player_b_mmr_after INT NULL,
      mmr_change INT NOT NULL DEFAULT 0,
      first_player_id CHAR(36) NOT NULL,
      seed VARCHAR(128) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'active',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      settled_at DATETIME(3) NULL,
      CONSTRAINT fk_ranked_matches_player_a FOREIGN KEY (player_a_id) REFERENCES users(id),
      CONSTRAINT fk_ranked_matches_player_b FOREIGN KEY (player_b_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS ranked_queue (
      player_id CHAR(36) PRIMARY KEY,
      mmr INT NOT NULL,
      joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_ranked_queue_user FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ranked_match_events (
      match_id CHAR(36) NOT NULL,
      sequence INT NOT NULL,
      actor_id CHAR(36) NOT NULL,
      round INT NOT NULL,
      phase VARCHAR(32) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      payload JSON NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (match_id, sequence),
      CONSTRAINT fk_ranked_match_events_match FOREIGN KEY (match_id) REFERENCES ranked_matches(id) ON DELETE CASCADE
    )`
  ];
}

export async function runMigrations(pool: Pick<Pool, "query">): Promise<void> {
  for (const statement of createMigrationStatements()) {
    await pool.query(statement);
  }
}
