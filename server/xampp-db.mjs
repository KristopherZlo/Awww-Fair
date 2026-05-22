import { createPool } from "mariadb";

function quoteMariaDbIdentifier(identifier) {
  if (typeof identifier !== "string" || !identifier.trim()) {
    throw new Error("MariaDB database name is required.");
  }
  return `\`${identifier.replace(/`/g, "``")}\``;
}

export function databaseBootstrapConfig(config) {
  const { database: _database, connectionLimit: _connectionLimit, ...bootstrapConfig } = config;
  return { ...bootstrapConfig, connectionLimit: 1 };
}

export function createDatabaseStatement(database) {
  return `CREATE DATABASE IF NOT EXISTS ${quoteMariaDbIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;
}

export async function ensureMariaDbDatabase(config, createPoolImpl = createPool) {
  const pool = createPoolImpl(databaseBootstrapConfig(config));
  try {
    await pool.query(createDatabaseStatement(config.database));
  } finally {
    await pool.end();
  }
}
