import { createPool, type Pool, type PoolConfig } from "mariadb";
import { createDevSeedMigrationStatements } from "./dev-seed";
import { CALIBRATION_MATCH_COUNT, RANKED_BOTS } from "./ranked-bots";

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
      deactivated_at DATETIME(3) NULL,
      delete_after DATETIME(3) NULL,
      is_bot BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE AFTER email`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at DATETIME(3) NULL AFTER email`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_after DATETIME(3) NULL AFTER deactivated_at`,
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
      rating_games INT NOT NULL DEFAULT 0,
      calibration_games INT NOT NULL DEFAULT 0,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      last_ranked_at DATETIME(3) NULL,
      ranked_leave_count INT NOT NULL DEFAULT 0,
      ranked_clean_games_since_leave INT NOT NULL DEFAULT 0,
      ranked_cooldown_until DATETIME(3) NULL,
      CONSTRAINT fk_player_ratings_user FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `ALTER TABLE player_ratings ADD COLUMN IF NOT EXISTS rating_games INT NOT NULL DEFAULT 0 AFTER ranked_games`,
    `ALTER TABLE player_ratings ADD COLUMN IF NOT EXISTS calibration_games INT NOT NULL DEFAULT 0 AFTER rating_games`,
    `ALTER TABLE player_ratings ADD COLUMN IF NOT EXISTS ranked_leave_count INT NOT NULL DEFAULT 0 AFTER last_ranked_at`,
    `ALTER TABLE player_ratings ADD COLUMN IF NOT EXISTS ranked_clean_games_since_leave INT NOT NULL DEFAULT 0 AFTER ranked_leave_count`,
    `ALTER TABLE player_ratings ADD COLUMN IF NOT EXISTS ranked_cooldown_until DATETIME(3) NULL AFTER ranked_clean_games_since_leave`,
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
      initial_state JSON NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'active',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      player_a_disconnected_at DATETIME(3) NULL,
      player_b_disconnected_at DATETIME(3) NULL,
      player_a_reconnect_deadline DATETIME(3) NULL,
      player_b_reconnect_deadline DATETIME(3) NULL,
      is_calibration BOOLEAN NOT NULL DEFAULT FALSE,
      is_bot_match BOOLEAN NOT NULL DEFAULT FALSE,
      bot_difficulty INT NULL,
      settled_at DATETIME(3) NULL,
      CONSTRAINT fk_ranked_matches_player_a FOREIGN KEY (player_a_id) REFERENCES users(id),
      CONSTRAINT fk_ranked_matches_player_b FOREIGN KEY (player_b_id) REFERENCES users(id)
    )`,
    `ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS initial_state JSON NULL AFTER seed`,
    `ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS player_a_disconnected_at DATETIME(3) NULL AFTER created_at`,
    `ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS player_b_disconnected_at DATETIME(3) NULL AFTER player_a_disconnected_at`,
    `ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS player_a_reconnect_deadline DATETIME(3) NULL AFTER player_b_disconnected_at`,
    `ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS player_b_reconnect_deadline DATETIME(3) NULL AFTER player_a_reconnect_deadline`,
    `ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS is_calibration BOOLEAN NOT NULL DEFAULT FALSE AFTER player_b_reconnect_deadline`,
    `ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS is_bot_match BOOLEAN NOT NULL DEFAULT FALSE AFTER is_calibration`,
    `ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS bot_difficulty INT NULL AFTER is_bot_match`,
    `CREATE TABLE IF NOT EXISTS ranked_queue (
      player_id CHAR(36) PRIMARY KEY,
      mmr INT NOT NULL,
      joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      allow_human BOOLEAN NOT NULL DEFAULT TRUE,
      bot_match_at DATETIME(3) NULL,
      CONSTRAINT fk_ranked_queue_user FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `ALTER TABLE ranked_queue ADD COLUMN IF NOT EXISTS allow_human BOOLEAN NOT NULL DEFAULT TRUE AFTER joined_at`,
    `ALTER TABLE ranked_queue ADD COLUMN IF NOT EXISTS bot_match_at DATETIME(3) NULL AFTER allow_human`,
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
    )`,
    ...RANKED_BOTS.map(
      (bot) => `INSERT INTO users (id, display_name, is_bot)
       VALUES ('${bot.id}', '${bot.displayName}', TRUE)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), is_bot = TRUE`
    ),
    ...RANKED_BOTS.map(
      (bot) => `INSERT INTO player_ratings (player_id, mmr, rating_games, calibration_games)
       VALUES ('${bot.id}', ${bot.mmr}, 0, ${CALIBRATION_MATCH_COUNT})
       ON DUPLICATE KEY UPDATE player_id = player_id`
    ),
    ...createDevSeedMigrationStatements()
  ];
}

export async function runMigrations(pool: Pick<Pool, "query">): Promise<void> {
  for (const statement of createMigrationStatements()) {
    await pool.query(statement);
  }
}
