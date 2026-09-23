import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const dbPath = process.env.DATABASE_PATH || './data/upsow.db';
const resolvedDbPath = path.resolve(process.cwd(), dbPath);

// Ensure the directory exists
const dbDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: Database.Database = new Database(resolvedDbPath);

// Enable Foreign Keys and Write-Ahead Logging (WAL) for concurrency & durability
db.pragma('foreign_keys = ON;');
db.pragma('journal_mode = WAL;');

/**
 * Initialize all database tables and indexes as specified in the PRD and architecture
 */
export function initializeDatabase(): void {
  const schemaSql = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER')),
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Teams table
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      lead_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Team Members join table
    CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (team_id, user_id)
    );

    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ARCHIVED', 'COMPLETED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Project Members join table
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_in_project TEXT NOT NULL DEFAULT 'MEMBER',
      PRIMARY KEY (project_id, user_id)
    );

    -- Central Tasks table (Single source of truth)
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
      status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'COMPLETED')),
      start_date TEXT,
      due_date TEXT,
      position_order REAL NOT NULL DEFAULT 1000.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Task Watchers table (for notification subscriptions)
    CREATE TABLE IF NOT EXISTS task_watchers (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, user_id)
    );

    -- Subtasks table
    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Task Comments table
    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Attachments table (Stored strictly in SQLite as BLOB)
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('TASK', 'COMMENT', 'CHAT')),
      entity_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      data BLOB NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Activity Logs table (Audit trail for every task event)
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Notifications table (In-app alerts and deadline reminders)
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Chat Channels table (Project channels and direct messages)
    CREATE TABLE IF NOT EXISTS chat_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_direct INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Chat Channel Members table
    CREATE TABLE IF NOT EXISTS chat_channel_members (
      channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (channel_id, user_id)
    );

    -- Chat Messages table
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      mentions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- PERFORMANCE INDEXES (Mandatory for high-frequency queries)
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

  db.exec(schemaSql);
}

/**
 * Populate default seed data for users, teams, and the flagship UPSOW project
 */
export function seedDatabase(): void {
  initializeDatabase();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) {
    return; // Already seeded
  }

  // Generic passwords for development testing (bcrypt rounds = 10)
  const salt = bcrypt.genSaltSync(10);
  const adminHash = bcrypt.hashSync('Admin@123', salt);
  const pmHash = bcrypt.hashSync('Manager@123', salt);
  const devHash = bcrypt.hashSync('Developer@123', salt);
  const opsHash = bcrypt.hashSync('Operations@123', salt);
  const designHash = bcrypt.hashSync('Designer@123', salt);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, avatar_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertTeam = db.prepare(`
    INSERT INTO teams (name, description, lead_id)
    VALUES (?, ?, ?)
  `);

  const insertTeamMember = db.prepare(`
    INSERT INTO team_members (team_id, user_id)
    VALUES (?, ?)
  `);

  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, team_id, manager_id, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertProjectMember = db.prepare(`
    INSERT INTO project_members (project_id, user_id, role_in_project)
    VALUES (?, ?, ?)
  `);

  const insertChannel = db.prepare(`
    INSERT INTO chat_channels (project_id, name, is_direct)
    VALUES (?, ?, ?)
  `);

  const insertChannelMember = db.prepare(`
    INSERT INTO chat_channel_members (channel_id, user_id)
    VALUES (?, ?)
  `);

  const seedTransaction = db.transaction(() => {
    // 1. Seed Generic Users (No individual personal names)
    const adminId = insertUser.run('Admin', 'admin@upsow.com', adminHash, 'ADMIN', 'https://api.dicebear.com/7.x/identicon/svg?seed=Admin').lastInsertRowid;
    const pmId = insertUser.run('Project Manager', 'pm@upsow.com', pmHash, 'PROJECT_MANAGER', 'https://api.dicebear.com/7.x/identicon/svg?seed=Manager').lastInsertRowid;
    const devId = insertUser.run('Developer', 'developer@upsow.com', devHash, 'TEAM_MEMBER', 'https://api.dicebear.com/7.x/identicon/svg?seed=Developer').lastInsertRowid;
    const opsId = insertUser.run('Operations Head', 'operationhead@upsow.com', opsHash, 'TEAM_MEMBER', 'https://api.dicebear.com/7.x/identicon/svg?seed=Operations').lastInsertRowid;
    const designId = insertUser.run('Designer', 'design@upsow.com', designHash, 'TEAM_MEMBER', 'https://api.dicebear.com/7.x/identicon/svg?seed=Designer').lastInsertRowid;

    // 2. Seed Teams
    const devTeamId = insertTeam.run('Development', 'Full-stack software engineering and architecture', devId).lastInsertRowid;
    const opsTeamId = insertTeam.run('Operations', 'Infrastructure, QA, and operational delivery', opsId).lastInsertRowid;
    const designTeamId = insertTeam.run('Design', 'Product design, UI/UX systems and branding', designId).lastInsertRowid;

    // 3. Team Memberships
    // Development team
    insertTeamMember.run(devTeamId, devId);
    insertTeamMember.run(devTeamId, designId);
    insertTeamMember.run(devTeamId, pmId);

    // Operations team
    insertTeamMember.run(opsTeamId, opsId);
    insertTeamMember.run(opsTeamId, pmId);

    // Design team
    insertTeamMember.run(designTeamId, designId);
    insertTeamMember.run(designTeamId, devId);

    // 4. Seed UPSOW Project
    const projectId = insertProject.run(
      'UPSOW',
      'Central company initiative: Product collaboration, task delivery and cross-team progress tracking platform.',
      devTeamId,
      pmId,
      'ACTIVE'
    ).lastInsertRowid;

    // 5. Project Members
    insertProjectMember.run(projectId, pmId, 'MANAGER');
    insertProjectMember.run(projectId, devId, 'LEAD_DEV');
    insertProjectMember.run(projectId, opsId, 'MEMBER');
    insertProjectMember.run(projectId, designId, 'DESIGNER');
    insertProjectMember.run(projectId, adminId, 'ADMIN');

    // 6. Project Chat Channels
    const generalChannelId = insertChannel.run(projectId, 'General', 0).lastInsertRowid;
    const devChannelId = insertChannel.run(projectId, 'Development', 0).lastInsertRowid;
    const opsChannelId = insertChannel.run(projectId, 'Operations', 0).lastInsertRowid;

    // Add all project members to channels
    const allUserIds = [adminId, pmId, devId, opsId, designId];
    for (const uId of allUserIds) {
      insertChannelMember.run(generalChannelId, uId);
      insertChannelMember.run(devChannelId, uId);
      insertChannelMember.run(opsChannelId, uId);
    }
  });

  seedTransaction();
}

// Automatically initialize schema when module is loaded
initializeDatabase();

// If run directly via CLI flag --seed
if (process.argv.includes('--seed')) {
  seedDatabase();
  console.log('Database initialized and seeded successfully.');
}
