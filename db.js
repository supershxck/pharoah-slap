/**
 * db.js — Persistence layer for Pharaoh Slap
 *
 * SQLite via better-sqlite3 (synchronous, zero-config).
 * EVERY query lives behind this module so the storage engine can be swapped
 * (e.g. to Postgres/Neon) without touching app logic — see design spec §5.
 *
 * Requires a persistent disk on Render. Path is configurable via DB_PATH;
 * defaults to ./data/pharaoh.db (mount your disk at ./data).
 */
"use strict";

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "pharaoh.db");

// Ensure the parent directory exists (disk mount or local dev).
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── SCHEMA ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    username          TEXT    UNIQUE NOT NULL,
    passcode_hash     TEXT    NOT NULL,
    created_at        TEXT    DEFAULT (datetime('now')),
    tutorial_path     TEXT    DEFAULT NULL,
    tutorial_stage    INTEGER DEFAULT 0,
    tutorial_complete INTEGER DEFAULT 0,
    ob_slap_speed     TEXT    DEFAULT NULL,
    ob_memory_score   TEXT    DEFAULT NULL,
    ob_prior_exp      TEXT    DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS progress (
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    god_id       TEXT    NOT NULL,
    stars        INTEGER DEFAULT 0,
    best_stats   TEXT    DEFAULT NULL,
    completed_at TEXT    DEFAULT NULL,
    PRIMARY KEY (user_id, god_id)
  );
`);

// ─── PREPARED STATEMENTS ─────────────────────────────────────────────────────
const stmt = {
  insertUser: db.prepare(
    `INSERT INTO users (username, passcode_hash) VALUES (?, ?)`,
  ),
  userByName: db.prepare(`SELECT * FROM users WHERE username = ?`),
  userById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  setOnboarding: db.prepare(`
    UPDATE users
       SET tutorial_path = ?, tutorial_stage = ?,
           ob_slap_speed = ?, ob_memory_score = ?, ob_prior_exp = ?
     WHERE id = ?`),
  setStage: db.prepare(
    `UPDATE users SET tutorial_stage = ?, tutorial_complete = ? WHERE id = ?`,
  ),
  progressByUser: db.prepare(`SELECT * FROM progress WHERE user_id = ?`),
  upsertProgress: db.prepare(`
    INSERT INTO progress (user_id, god_id, stars, best_stats, completed_at)
    VALUES (@user_id, @god_id, @stars, @best_stats, datetime('now'))
    ON CONFLICT(user_id, god_id) DO UPDATE SET
      stars        = MAX(progress.stars, excluded.stars),
      best_stats   = excluded.best_stats,
      completed_at = datetime('now')`),
};

// ─── PUBLIC API ──────────────────────────────────────────────────────────────
module.exports = {
  createUser(username, passcodeHash) {
    const info = stmt.insertUser.run(username, passcodeHash);
    return stmt.userById.get(info.lastInsertRowid);
  },
  getUserByName(username) {
    return stmt.userByName.get(username);
  },
  getUserById(id) {
    return stmt.userById.get(id);
  },
  saveOnboarding(userId, { path, slapSpeed, memoryScore, priorExperience }) {
    stmt.setOnboarding.run(path, 0, slapSpeed, memoryScore, priorExperience, userId);
    return stmt.userById.get(userId);
  },
  setStage(userId, stage, complete) {
    stmt.setStage.run(stage, complete ? 1 : 0, userId);
  },
  getProgress(userId) {
    return stmt.progressByUser.all(userId);
  },
  recordProgress(userId, godId, stars, bestStats) {
    stmt.upsertProgress.run({
      user_id: userId,
      god_id: godId,
      stars,
      best_stats: bestStats ? JSON.stringify(bestStats) : null,
    });
    return stmt.progressByUser.all(userId);
  },
  _raw: db, // escape hatch for migrations/tests
};
