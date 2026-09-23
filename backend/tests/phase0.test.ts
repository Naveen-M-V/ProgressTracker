import assert from 'assert';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';

console.log('=== [PHASE 0] RUNNING FOUNDATION VERIFICATION TESTS ===\n');

try {
  // Test 1: Database Initialization
  console.log('[Test 1] Verifying Database Initialization & Pragmas...');
  initializeDatabase();
  seedDatabase();

  const fkPragma = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  assert.strictEqual(fkPragma.foreign_keys, 1, 'Foreign keys pragma must be enabled (1)');

  const journalPragma = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
  assert.strictEqual(journalPragma.journal_mode.toLowerCase(), 'wal', 'Journal mode must be WAL');
  console.log('  ✓ Foreign keys enabled & WAL mode active');

  // Test 2: Check All Required Tables Exist
  console.log('[Test 2] Verifying Core Tables...');
  const expectedTables = [
    'users',
    'teams',
    'team_members',
    'projects',
    'project_members',
    'tasks',
    'task_watchers',
    'subtasks',
    'task_comments',
    'attachments',
    'activity_logs',
    'notifications',
    'chat_channels',
    'chat_channel_members',
    'chat_messages'
  ];

  const existingTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all() as { name: string }[];
  const tableNames = new Set(existingTables.map(t => t.name));

  for (const table of expectedTables) {
    assert.ok(tableNames.has(table), `Expected table '${table}' must exist in the database`);
  }
  console.log(`  ✓ All ${expectedTables.length} core tables verified successfully`);

  // Test 3: Check Required Performance Indexes Exist
  console.log('[Test 3] Verifying Performance Indexes...');
  const expectedIndexes = [
    'idx_tasks_project_id',
    'idx_tasks_team_id',
    'idx_tasks_assignee_id',
    'idx_tasks_status',
    'idx_tasks_due_date',
    'idx_tasks_updated_at',
    'idx_task_watchers_user',
    'idx_activity_logs_task_id',
    'idx_activity_logs_project_id',
    'idx_activity_logs_created_at',
    'idx_notifications_recipient_read',
    'idx_notifications_created_at',
    'idx_chat_messages_channel_created',
    'idx_chat_channel_members_user',
    'idx_project_members_user',
    'idx_team_members_user',
    'idx_attachments_entity'
  ];

  const existingIndexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
  ).all() as { name: string }[];
  const indexNames = new Set(existingIndexes.map(i => i.name));

  for (const idx of expectedIndexes) {
    assert.ok(indexNames.has(idx), `Expected index '${idx}' must exist in the database`);
  }
  console.log(`  ✓ All ${expectedIndexes.length} performance indexes verified`);

  // Test 4: Verify Seed Data
  console.log('[Test 4] Verifying Seed Data...');
  const users = db.prepare('SELECT email, role FROM users').all() as { email: string; role: string }[];
  assert.ok(users.length >= 5, 'Must seed at least 5 demo users');

  const admin = users.find(u => u.email === 'admin@upsow.com');
  const pm = users.find(u => u.email === 'pm@upsow.com');
  const dev = users.find(u => u.email === 'developer@upsow.com');
  const ops = users.find(u => u.email === 'operationhead@upsow.com');
  const design = users.find(u => u.email === 'design@upsow.com');

  assert.ok(admin && admin.role === 'ADMIN', 'Admin must be seeded with ADMIN role');
  assert.ok(pm && pm.role === 'PROJECT_MANAGER', 'Project Manager must be seeded with PROJECT_MANAGER role');
  assert.ok(dev && dev.role === 'TEAM_MEMBER', 'Developer must be seeded with TEAM_MEMBER role');
  assert.ok(ops && ops.role === 'TEAM_MEMBER', 'Operations Head must be seeded with TEAM_MEMBER role');
  assert.ok(design && design.role === 'TEAM_MEMBER', 'Designer must be seeded with TEAM_MEMBER role');

  const teams = db.prepare('SELECT name FROM teams').all() as { name: string }[];
  assert.ok(teams.some(t => t.name === 'Development'), 'Development team must be seeded');
  assert.ok(teams.some(t => t.name === 'Operations'), 'Operations team must be seeded');
  assert.ok(teams.some(t => t.name === 'Design'), 'Design team must be seeded');

  const projects = db.prepare('SELECT name FROM projects').all() as { name: string }[];
  assert.ok(projects.some(p => p.name === 'UPSOW'), 'Flagship UPSOW project must be seeded');

  const channels = db.prepare('SELECT name FROM chat_channels').all() as { name: string }[];
  assert.ok(channels.some(c => c.name === 'General'), 'General channel must be seeded');
  assert.ok(channels.some(c => c.name === 'Development'), 'Development channel must be seeded');
  console.log('  ✓ Seed users, teams, project UPSOW, and chat channels verified');

  // Test 5: Verify SQLite Transactions (Atomicity)
  console.log('[Test 5] Verifying Transaction Rollback & Commit...');
  const countBefore = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;

  try {
    const failingTx = db.transaction(() => {
      db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Rollback User', 'rollback@upsow.com', 'hash', 'TEAM_MEMBER')").run();
      throw new Error('Simulated transaction failure');
    });
    failingTx();
  } catch (err) {
    // Expected error
  }

  const countAfterRollback = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  assert.strictEqual(countBefore, countAfterRollback, 'Transaction must roll back on error without leaking partial state');
  console.log('  ✓ Transaction rollback tested and confirmed atomic');

  // Test 6: Verify BLOB Attachment column can handle binary buffer
  console.log('[Test 6] Verifying SQLite BLOB storage capability...');
  const testBuffer = Buffer.from('Upsow Progress Tracker Test Attachment Content - BLOB', 'utf-8');
  const user = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: number };

  const insertAttachment = db.prepare(`
    INSERT INTO attachments (entity_type, entity_id, file_name, mime_type, file_size, data, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const attResult = insertAttachment.run('TASK', 1, 'test.txt', 'text/plain', testBuffer.length, testBuffer, user.id);

  const fetchedAttachment = db.prepare('SELECT data, file_name, file_size FROM attachments WHERE id = ?').get(attResult.lastInsertRowid) as { data: Buffer; file_name: string; file_size: number };
  assert.strictEqual(fetchedAttachment.file_name, 'test.txt');
  assert.strictEqual(fetchedAttachment.data.toString('utf-8'), testBuffer.toString('utf-8'));
  
  // Clean up test attachment
  db.prepare('DELETE FROM attachments WHERE id = ?').run(attResult.lastInsertRowid);
  console.log('  ✓ SQLite BLOB insertion, read-back, and binary integrity verified');

  console.log('\n=== [PHASE 0] ALL TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
} catch (error: any) {
  console.error('\n❌ [PHASE 0] TEST FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
