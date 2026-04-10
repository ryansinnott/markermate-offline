import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'markermate.db');
const db: DatabaseType = new Database(dbPath);

// Enable foreign keys and WAL mode
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database tables
export function initializeDatabase(): void {
  logger.info('Initializing database...');

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      school_name TEXT,
      created_at INTEGER NOT NULL,
      last_login INTEGER
    )
  `);

  // Create index for email lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email)
  `);

  // Create saved_rubrics table with user_id
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_rubrics (
      id TEXT PRIMARY KEY,
      rubric_name TEXT NOT NULL,
      rubric_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used INTEGER NOT NULL,
      user_id TEXT REFERENCES users(id)
    )
  `);

  // Create index for sorting by last_used
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_saved_rubrics_last_used
    ON saved_rubrics(last_used DESC)
  `);

  // Create index for user_id lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_saved_rubrics_user_id
    ON saved_rubrics(user_id)
  `);

  // Create unique constraint on rubric_name per user
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_rubrics_user_name
    ON saved_rubrics(user_id, rubric_name)
  `);

  // Seed local user for offline mode
  seedLocalUser();

  logger.info(`Database initialized at ${dbPath}`);
}

function seedLocalUser(): void {
  const localUserId = 'local-user';
  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(localUserId);

  if (!existingUser) {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO users (id, email, password_hash, name, school_name, created_at, last_login)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(localUserId, 'local@markermate.local', 'no-auth', 'Teacher', null, now, now);
    logger.info('Local user created for offline mode');
  }
}

// TypeScript interfaces
export interface User {
  id: string;
  email: string;
  name: string;
  schoolName: string | null;
  createdAt: number;
  lastLogin: number | null;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface SavedRubricCriterion {
  name: string;
  description: string;
  maxScore: number;
}

export interface SavedRubricData {
  criteria: SavedRubricCriterion[];
  totalScore: number;
}

export interface SavedRubricListItem {
  id: string;
  rubricName: string;
  lastUsed: number;
  createdAt: number;
  userId: string;
}

export interface SavedRubricFull {
  id: string;
  rubricName: string;
  rubricData: SavedRubricData;
  createdAt: number;
  lastUsed: number;
  userId: string;
}

// ============ USER OPERATIONS ============

export function createUser(
  id: string,
  email: string,
  passwordHash: string,
  name: string,
  schoolName?: string
): User {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, school_name, created_at, last_login)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, email, passwordHash, name, schoolName || null, now, now);

  return {
    id,
    email,
    name,
    schoolName: schoolName || null,
    createdAt: now,
    lastLogin: now
  };
}

export function getUserByEmail(email: string): UserWithPassword | null {
  const stmt = db.prepare(`
    SELECT id, email, password_hash, name, school_name, created_at, last_login
    FROM users
    WHERE email = ?
  `);
  const row = stmt.get(email) as any;
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    schoolName: row.school_name,
    createdAt: row.created_at,
    lastLogin: row.last_login
  };
}

export function getUserById(id: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, name, school_name, created_at, last_login
    FROM users
    WHERE id = ?
  `);
  const row = stmt.get(id) as any;
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    schoolName: row.school_name,
    createdAt: row.created_at,
    lastLogin: row.last_login
  };
}

export function updateLastLogin(userId: string): void {
  const stmt = db.prepare(`
    UPDATE users
    SET last_login = ?
    WHERE id = ?
  `);
  stmt.run(Date.now(), userId);
}

// ============ RUBRIC OPERATIONS ============

export function saveRubric(id: string, rubricName: string, rubricData: SavedRubricData, userId: string): void {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO saved_rubrics (id, rubric_name, rubric_data, created_at, last_used, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, rubricName, JSON.stringify(rubricData), now, now, userId);
}

export function getRubricByName(rubricName: string, userId: string): SavedRubricFull | null {
  const stmt = db.prepare(`
    SELECT id, rubric_name, rubric_data, created_at, last_used, user_id
    FROM saved_rubrics
    WHERE rubric_name = ? AND user_id = ?
  `);
  const row = stmt.get(rubricName, userId) as any;
  if (!row) return null;

  return {
    id: row.id,
    rubricName: row.rubric_name,
    rubricData: JSON.parse(row.rubric_data),
    createdAt: row.created_at,
    lastUsed: row.last_used,
    userId: row.user_id
  };
}

export function getAllRubrics(userId: string): SavedRubricListItem[] {
  const stmt = db.prepare(`
    SELECT id, rubric_name, created_at, last_used, user_id
    FROM saved_rubrics
    WHERE user_id = ?
    ORDER BY last_used DESC
  `);
  const rows = stmt.all(userId) as any[];

  return rows.map(row => ({
    id: row.id,
    rubricName: row.rubric_name,
    createdAt: row.created_at,
    lastUsed: row.last_used,
    userId: row.user_id
  }));
}

export function getRubricById(id: string, userId: string): SavedRubricFull | null {
  const stmt = db.prepare(`
    SELECT id, rubric_name, rubric_data, created_at, last_used, user_id
    FROM saved_rubrics
    WHERE id = ? AND user_id = ?
  `);
  const row = stmt.get(id, userId) as any;
  if (!row) return null;

  return {
    id: row.id,
    rubricName: row.rubric_name,
    rubricData: JSON.parse(row.rubric_data),
    createdAt: row.created_at,
    lastUsed: row.last_used,
    userId: row.user_id
  };
}

export function updateLastUsed(id: string, userId: string): void {
  const stmt = db.prepare(`
    UPDATE saved_rubrics
    SET last_used = ?
    WHERE id = ? AND user_id = ?
  `);
  stmt.run(Date.now(), id, userId);
}

export function deleteRubric(id: string, userId: string): boolean {
  const stmt = db.prepare(`
    DELETE FROM saved_rubrics
    WHERE id = ? AND user_id = ?
  `);
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

export default db;
