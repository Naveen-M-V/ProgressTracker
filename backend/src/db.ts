import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

// Configure pg type parsers:
// Type 20 is INT8 (bigint, returned by COUNT(*)). Parse as standard JS number.
types.setTypeParser(20, (val: string) => (val === null ? null : parseInt(val, 10)));
// Timestamp parsers: return ISO-8601 strings
types.setTypeParser(1114, (val: string) => (val === null ? null : new Date(val + 'Z').toISOString()));
types.setTypeParser(1184, (val: string) => (val === null ? null : new Date(val).toISOString()));

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[Database] Warning: DATABASE_URL is not set in environment variables.');
}

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

/**
 * Format SQLite-style '?' placeholders into PostgreSQL-style '$1, $2, ...'
 * ignoring any '?' inside single-quoted SQL string literals.
 */
export function formatSql(sql: string): string {
  let paramIndex = 1;
  let inString = false;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      // Check for escaped quote ''
      if (inString && sql[i + 1] === "'") {
        result += "''";
        i++;
        continue;
      }
      inString = !inString;
      result += char;
    } else if (char === '?' && !inString) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }

  return result.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
}

export interface TransactionClient {
  query: <T extends QueryResultRow = any>(sql: string, params?: any[]) => Promise<T[]>;
  queryOne: <T extends QueryResultRow = any>(sql: string, params?: any[]) => Promise<T | undefined>;
  execute: (sql: string, params?: any[]) => Promise<{ rowCount: number; id?: number }>;
  client: PoolClient;
}

/**
 * Execute query and return all matching rows
 */
export async function query<T extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<T[]> {
  const formattedSql = formatSql(sql);
  const result: QueryResult<T> = await pool.query<T>(formattedSql, params);
  return result.rows;
}

/**
 * Execute query and return the first matching row or undefined
 */
export async function queryOne<T extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

/**
 * Execute an INSERT / UPDATE / DELETE statement and return rowCount / inserted ID
 */
export async function execute(sql: string, params: any[] = []): Promise<{ rowCount: number; id?: number }> {
  const formattedSql = formatSql(sql);
  const result = await pool.query(formattedSql, params);
  const id = result.rows && result.rows.length > 0 && result.rows[0].id !== undefined
    ? Number(result.rows[0].id)
    : undefined;
  return {
    rowCount: result.rowCount || 0,
    id
  };
}

/**
 * Transaction helper running within BEGIN ... COMMIT / ROLLBACK on a pooled connection
 */
export async function withTransaction<T>(
  callback: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx: TransactionClient = {
      query: async <R extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<R[]> => {
        const formatted = formatSql(sql);
        const res = await client.query<R>(formatted, params);
        return res.rows;
      },
      queryOne: async <R extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<R | undefined> => {
        const formatted = formatSql(sql);
        const res = await client.query<R>(formatted, params);
        return res.rows[0];
      },
      execute: async (sql: string, params: any[] = []): Promise<{ rowCount: number; id?: number }> => {
        const formatted = formatSql(sql);
        const res = await client.query(formatted, params);
        const id = res.rows && res.rows.length > 0 && res.rows[0].id !== undefined
          ? Number(res.rows[0].id)
          : undefined;
        return { rowCount: res.rowCount || 0, id };
      },
      client
    };

    const result = await callback(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Unified `db` interface for convenient usage across services
 */
export const db = {
  pool,
  query,
  queryOne,
  execute,
  withTransaction
};

/**
 * Initialize all PostgreSQL database tables and indexes on Neon
 */
export async function initializeDatabase(): Promise<void> {
  await pool.query('CREATE SCHEMA IF NOT EXISTS upsow;');

  const schemaSql = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL CHECK(role IN ('ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER')),
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Teams table
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      lead_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Team Members join table
    CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (team_id, user_id)
    );

    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ARCHIVED', 'COMPLETED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Project Members join table
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_in_project VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
      PRIMARY KEY (project_id, user_id)
    );

    -- Central Tasks table (Single source of truth)
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      priority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
      status VARCHAR(50) NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'COMPLETED')),
      start_date TEXT,
      due_date TEXT,
      position_order DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
      item_type VARCHAR(20) NOT NULL DEFAULT 'TASK' CHECK(item_type IN ('TASK', 'EVENT')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Task Watchers table
    CREATE TABLE IF NOT EXISTS task_watchers (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, user_id)
    );

    -- Subtasks table
    CREATE TABLE IF NOT EXISTS subtasks (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Task Comments table
    CREATE TABLE IF NOT EXISTS task_comments (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Attachments table (Stored in Postgres as BYTEA)
    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL CHECK(entity_type IN ('TASK', 'COMMENT', 'CHAT')),
      entity_id INTEGER NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(255) NOT NULL,
      file_size INTEGER NOT NULL,
      data BYTEA NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Activity Logs table
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type VARCHAR(100) NOT NULL,
      old_value TEXT,
      new_value TEXT,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      entity_type VARCHAR(50),
      entity_id INTEGER,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Chat Channels table
    CREATE TABLE IF NOT EXISTS chat_channels (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      is_direct BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Chat Channel Members table
    CREATE TABLE IF NOT EXISTS chat_channel_members (
      channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (channel_id, user_id)
    );

    -- Chat Messages table
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      mentions_json TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks(team_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);

    CREATE INDEX IF NOT EXISTS idx_task_watchers_user ON task_watchers(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_task_id ON activity_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_project_id ON activity_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

    CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created ON chat_messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_channel_members_user ON chat_channel_members(user_id);

    CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

    CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
  `;

  await pool.query(schemaSql);
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'TASK';");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_tasks_item_type ON tasks(item_type);");
}

/**
 * Populate default seed data: ONLY the 3 core accounts (Admin, PM, Team Member)
 */
export async function seedDatabase(): Promise<void> {
  await initializeDatabase();

  const userCountRow = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (userCountRow && userCountRow.count > 0) {
    return; // Already seeded
  }

  const salt = bcrypt.genSaltSync(10);
  const adminHash = bcrypt.hashSync('Admin@123', salt);
  const pmHash = bcrypt.hashSync('Manager@123', salt);
  const devHash = bcrypt.hashSync('Developer@123', salt);

  await withTransaction(async (tx) => {
    await tx.execute(`
      INSERT INTO users (name, email, password_hash, role, avatar_url)
      VALUES 
        ('Admin', 'admin@upsow.com', $1, 'ADMIN', 'https://api.dicebear.com/7.x/identicon/svg?seed=Admin'),
        ('Project Manager', 'pm@upsow.com', $2, 'PROJECT_MANAGER', 'https://api.dicebear.com/7.x/identicon/svg?seed=Manager'),
        ('Developer', 'developer@upsow.com', $3, 'TEAM_MEMBER', 'https://api.dicebear.com/7.x/identicon/svg?seed=Developer')
      ON CONFLICT (email) DO NOTHING
    `, [adminHash, pmHash, devHash]);
  });
}

/**
 * Cleanly reset and purge all mock data, retaining/reseeding only the 3 core accounts
 */
export async function resetDatabase(): Promise<void> {
  await initializeDatabase();

  await withTransaction(async (tx) => {
    await tx.execute('TRUNCATE chat_messages, chat_channel_members, chat_channels, task_comments, task_watchers, subtasks, attachments, activity_logs, notifications, tasks, project_members, projects, team_members, teams, users RESTART IDENTITY CASCADE');
  });

  await seedDatabase();
}

// If run directly via CLI flag --seed or --reset
const isDirectCli = process.argv[1] && (process.argv[1].endsWith('db.ts') || process.argv[1].endsWith('db.js'));
if (isDirectCli) {
  (async () => {
    if (process.argv.includes('--reset')) {
      await resetDatabase();
      console.log('Database cleanly reset on Neon with core accounts.');
    } else {
      await seedDatabase();
      console.log('Database initialized and verified on Neon successfully.');
    }
    await pool.end();
  })().catch(err => {
    console.error('Database CLI operation failed:', err);
    process.exit(1);
  });
}
