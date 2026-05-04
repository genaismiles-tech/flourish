import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? path.join(__dirname, "../../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "flourish.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    profile_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS garden_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plant_name TEXT NOT NULL,
    plant_emoji TEXT NOT NULL DEFAULT '🌱',
    plant_category TEXT,
    nursery_name TEXT,
    nursery_type TEXT,
    price_estimate TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export interface DbUser {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface DbHistoryRow {
  id: number;
  user_id: number;
  type: string;
  title: string;
  result_json: string;
  created_at: string;
}

const stmts = {
  createUser:     db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)"),
  userByEmail:    db.prepare("SELECT * FROM users WHERE email = ?"),
  userById:       db.prepare("SELECT * FROM users WHERE id = ?"),
  upsertProfile:  db.prepare(`
    INSERT INTO user_profiles (user_id, profile_json, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at
  `),
  getProfile:     db.prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?"),
  addHistory:     db.prepare("INSERT INTO history (user_id, type, title, result_json) VALUES (?, ?, ?, ?)"),
  listHistory:    db.prepare("SELECT id, type, title, created_at FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"),
  getHistoryItem: db.prepare("SELECT * FROM history WHERE id = ? AND user_id = ?"),
  deleteHistory:  db.prepare("DELETE FROM history WHERE id = ? AND user_id = ?"),
  addPlanItem:    db.prepare("INSERT INTO garden_plan (user_id, plant_name, plant_emoji, plant_category, nursery_name, nursery_type, price_estimate) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  listPlan:       db.prepare("SELECT * FROM garden_plan WHERE user_id = ? ORDER BY status ASC, created_at DESC"),
  updatePlanStatus: db.prepare("UPDATE garden_plan SET status = ? WHERE id = ? AND user_id = ?"),
  deletePlanItem: db.prepare("DELETE FROM garden_plan WHERE id = ? AND user_id = ?"),
  planItemExists: db.prepare("SELECT id FROM garden_plan WHERE user_id = ? AND plant_name = ? AND status != 'planted'"),
};

export function createUser(email: string, hash: string): DbUser {
  const r = stmts.createUser.run(email, hash);
  return stmts.userById.get(r.lastInsertRowid) as DbUser;
}

export function getUserByEmail(email: string): DbUser | undefined {
  return stmts.userByEmail.get(email) as DbUser | undefined;
}

export function getUserById(id: number): DbUser | undefined {
  return stmts.userById.get(id) as DbUser | undefined;
}

export function upsertProfile(userId: number, profile: object): void {
  stmts.upsertProfile.run(userId, JSON.stringify(profile));
}

export function getProfile(userId: number): object | null {
  const row = stmts.getProfile.get(userId) as { profile_json: string } | undefined;
  return row ? (JSON.parse(row.profile_json) as object) : null;
}

export function addHistory(userId: number, type: string, title: string, result: object): number {
  const r = stmts.addHistory.run(userId, type, title, JSON.stringify(result));
  return r.lastInsertRowid as number;
}

export function listHistory(userId: number): Array<{ id: number; type: string; title: string; created_at: string }> {
  return stmts.listHistory.all(userId) as Array<{ id: number; type: string; title: string; created_at: string }>;
}

export function getHistoryItem(id: number, userId: number): DbHistoryRow | undefined {
  return stmts.getHistoryItem.get(id, userId) as DbHistoryRow | undefined;
}

export function deleteHistoryItem(id: number, userId: number): boolean {
  return stmts.deleteHistory.run(id, userId).changes > 0;
}

export interface DbPlanItem {
  id: number;
  user_id: number;
  plant_name: string;
  plant_emoji: string;
  plant_category: string | null;
  nursery_name: string | null;
  nursery_type: string | null;
  price_estimate: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export function addPlanItem(
  userId: number,
  plantName: string,
  plantEmoji: string,
  plantCategory: string,
  nurseryName: string | null,
  nurseryType: string | null,
  priceEstimate: string | null
): number {
  const r = stmts.addPlanItem.run(userId, plantName, plantEmoji, plantCategory, nurseryName, nurseryType, priceEstimate);
  return r.lastInsertRowid as number;
}

export function listPlan(userId: number): DbPlanItem[] {
  return stmts.listPlan.all(userId) as DbPlanItem[];
}

export function updatePlanStatus(id: number, userId: number, status: string): boolean {
  return stmts.updatePlanStatus.run(status, id, userId).changes > 0;
}

export function deletePlanItem(id: number, userId: number): boolean {
  return stmts.deletePlanItem.run(id, userId).changes > 0;
}

export function planItemExists(userId: number, plantName: string): boolean {
  return !!stmts.planItemExists.get(userId, plantName);
}

export default db;
