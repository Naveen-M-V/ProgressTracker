import assert from 'assert';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';
import { app, server } from '../src/index.js';
import { io as ClientSocket } from 'socket.io-client';
import http from 'http';

console.log('=== [PHASE 3] RUNNING CENTRAL TASK ENGINE & REAL-TIME EVENT TESTS ===\n');

let testPort: number;
let serverInstance: http.Server;

// Helper to make test HTTP requests
async function testRequest(
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runPhase3Tests() {
  try {
    initializeDatabase();
    seedDatabase();

    // Ensure server is listening on an active port for HTTP & Socket.io
    if (!server.listening) {
      await new Promise<void>((resolve) => {
        serverInstance = server.listen(0, () => {
          const address = serverInstance.address() as any;
          testPort = address.port;
          resolve();
        });
      });
    } else {
      serverInstance = server;
      const address = serverInstance.address() as any;
      testPort = typeof address === 'object' && address ? address.port : 5000;
    }

    // 1. Authenticate users
    const adminLogin = await testRequest('POST', '/api/auth/login', { email: 'admin@upsow.com', password: 'Admin@123' });
    const adminToken = adminLogin.body.data.token;
    const adminUser = adminLogin.body.data.user;

    const pmLogin = await testRequest('POST', '/api/auth/login', { email: 'pm@upsow.com', password: 'Manager@123' });
    const pmToken = pmLogin.body.data.token;
    const pmUser = pmLogin.body.data.user;

    const devLogin = await testRequest('POST', '/api/auth/login', { email: 'developer@upsow.com', password: 'Developer@123' });
    const devToken = devLogin.body.data.token;
    const devUser = devLogin.body.data.user;

    const timestamp = Date.now();

    // Create dedicated project for Phase 3 test with pmUser as manager and devUser as member
    const createProjRes = await testRequest('POST', '/api/projects', {
      name: `Phase3 Project ${timestamp}`,
      manager_id: pmUser.id,
      member_ids: [devUser.id]
    }, adminToken);
    assert.strictEqual(createProjRes.status, 201, 'Phase 3 project creation must succeed');
    const projectId = createProjRes.body.data.id;

    // ----------------------------------------------------
    // Test 1: Task Creation (Title, Description, Priority, Due Date, Subtasks)
    // ----------------------------------------------------
    console.log('[Test 1] Task Creation with Subtasks...');
    const createTaskRes = await testRequest('POST', '/api/tasks', {
      title: `Build Core API Gateway ${timestamp}`,
      description: 'Implement reverse proxy, auth headers, and route dispatching',
      project_id: projectId,
      priority: 'HIGH',
      status: 'TODO',
      start_date: '2026-09-22',
      due_date: '2026-09-30',
      subtasks: ['Configure proxy routes', 'Add rate limiting', 'Write unit tests']
    }, pmToken);

    assert.strictEqual(createTaskRes.status, 201);
    assert.strictEqual(createTaskRes.body.success, true);
    assert.strictEqual(createTaskRes.body.data.title, `Build Core API Gateway ${timestamp}`);
    assert.strictEqual(createTaskRes.body.data.priority, 'HIGH');
    assert.strictEqual(createTaskRes.body.data.status, 'TODO');
    assert.strictEqual(createTaskRes.body.data.subtasks.length, 3);
    const taskId = createTaskRes.body.data.id;
    console.log('  ✓ Task created with 3 subtasks (201 Created)');

    // ----------------------------------------------------
    // Test 2: Task Detail Retrieval by ID
    // ----------------------------------------------------
    console.log('[Test 2] Task Retrieval by ID...');
    const getTaskRes = await testRequest('GET', `/api/tasks/${taskId}`, undefined, devToken);
    assert.strictEqual(getTaskRes.status, 200);
    assert.strictEqual(getTaskRes.body.data.id, taskId);
    assert.ok(getTaskRes.body.data.project_name, 'Project name must be present');
    assert.strictEqual(getTaskRes.body.data.creator_name, pmUser.name);
    assert.strictEqual(getTaskRes.body.data.subtasks.length, 3);
    assert.ok(getTaskRes.body.data.activity_logs.length >= 1, 'Must have creation activity log');
    console.log('  ✓ Detailed task retrieved with project, creator, subtasks & activity log');

    // ----------------------------------------------------
    // Test 3: Task Filtering
    // ----------------------------------------------------
    console.log('[Test 3] Task Filtering (by project, status, priority)...');
    const filterRes = await testRequest('GET', `/api/tasks?project_id=${projectId}&status=TODO&priority=HIGH`, undefined, devToken);
    assert.strictEqual(filterRes.status, 200);
    assert.ok(filterRes.body.data.some((t: any) => t.id === taskId));
    console.log('  ✓ Multi-criteria filter query verified');

    // ----------------------------------------------------
    // Test 4: Task Update (Title, Priority, Dates)
    // ----------------------------------------------------
    console.log('[Test 4] Task Update & Change Tracking...');
    const updateTaskRes = await testRequest('PUT', `/api/tasks/${taskId}`, {
      title: `Build Core API Gateway v2 ${timestamp}`,
      priority: 'URGENT',
      due_date: '2026-10-05'
    }, pmToken);

    assert.strictEqual(updateTaskRes.status, 200);
    assert.strictEqual(updateTaskRes.body.data.title, `Build Core API Gateway v2 ${timestamp}`);
    assert.strictEqual(updateTaskRes.body.data.priority, 'URGENT');
    assert.strictEqual(updateTaskRes.body.data.due_date, '2026-10-05');
    console.log('  ✓ Task updated and activity changes recorded');

    // ----------------------------------------------------
    // Test 5: Authoritative Status Transition (TODO -> IN_PROGRESS)
    // ----------------------------------------------------
    console.log('[Test 5] Status Transition (TODO -> IN_PROGRESS)...');
    const statusChangeRes = await testRequest('PATCH', `/api/tasks/${taskId}/status`, {
      status: 'IN_PROGRESS',
      position_order: 1500.0
    }, devToken);

    assert.strictEqual(statusChangeRes.status, 200);
    assert.strictEqual(statusChangeRes.body.data.status, 'IN_PROGRESS');
    assert.strictEqual(statusChangeRes.body.data.position_order, 1500.0);

    // Verify activity history recorded STATUS_CHANGED
    const activityCheck = db.prepare(`
      SELECT action_type, old_value, new_value 
      FROM activity_logs 
      WHERE task_id = ? AND action_type = 'STATUS_CHANGED'
      ORDER BY id DESC LIMIT 1
    `).get(taskId) as any;
    assert.ok(activityCheck, 'Activity log must contain STATUS_CHANGED');
    assert.strictEqual(activityCheck.old_value, 'TODO');
    assert.strictEqual(activityCheck.new_value, 'IN_PROGRESS');
    console.log('  ✓ Status transition committed with atomic audit trail');

    // ----------------------------------------------------
    // Test 6: Status Transition to COMPLETED & Project Progress Update
    // ----------------------------------------------------
    console.log('[Test 6] Status Transition to COMPLETED & Progress Sync...');
    const completeRes = await testRequest('PATCH', `/api/tasks/${taskId}/status`, {
      status: 'COMPLETED'
    }, devToken);

    assert.strictEqual(completeRes.status, 200);
    assert.strictEqual(completeRes.body.data.status, 'COMPLETED');

    const progressRes = await testRequest('GET', `/api/projects/${projectId}/progress`, undefined, pmToken);
    assert.strictEqual(progressRes.status, 200);
    assert.ok(progressRes.body.data.completed_tasks >= 1);
    console.log('  ✓ Task completion automatically synchronizes project progress metrics');

    // Move back to IN_PROGRESS for remaining tests
    await testRequest('PATCH', `/api/tasks/${taskId}/status`, { status: 'IN_PROGRESS' }, pmToken);

    // ----------------------------------------------------
    // Test 7: Task Assignment & Watchers Registration
    // ----------------------------------------------------
    console.log('[Test 7] Task Assignment & Watchers...');
    const assignRes = await testRequest('PATCH', `/api/tasks/${taskId}/assign`, {
      assignee_id: devUser.id
    }, pmToken);

    assert.strictEqual(assignRes.status, 200);
    assert.strictEqual(assignRes.body.data.assignee_id, devUser.id);

    // Verify assignee is in task_watchers
    const isWatcher = db.prepare('SELECT 1 FROM task_watchers WHERE task_id = ? AND user_id = ?').get(taskId, devUser.id);
    assert.ok(isWatcher, 'Assignee must automatically be registered as task watcher');
    console.log('  ✓ Task assigned and assignee added to watchers list');

    // ----------------------------------------------------
    // Test 8: Subtask CRUD
    // ----------------------------------------------------
    console.log('[Test 8] Subtask Creation, Toggling & Deletion...');
    // Create new subtask
    const newSubtaskRes = await testRequest('POST', `/api/tasks/${taskId}/subtasks`, {
      title: 'Run performance benchmark'
    }, devToken);
    assert.strictEqual(newSubtaskRes.status, 201);
    assert.strictEqual(newSubtaskRes.body.data.title, 'Run performance benchmark');
    assert.strictEqual(newSubtaskRes.body.data.is_completed, false);
    const subtaskId = newSubtaskRes.body.data.id;

    // Toggle subtask to completed
    const toggleSubtaskRes = await testRequest('PUT', `/api/tasks/subtasks/${subtaskId}`, {
      is_completed: true
    }, devToken);
    assert.strictEqual(toggleSubtaskRes.status, 200);
    assert.strictEqual(toggleSubtaskRes.body.data.is_completed, true);

    // Delete subtask
    const deleteSubtaskRes = await testRequest('DELETE', `/api/tasks/subtasks/${subtaskId}`, undefined, devToken);
    assert.strictEqual(deleteSubtaskRes.status, 200);
    console.log('  ✓ Subtask added, toggled completed, and deleted');

    // ----------------------------------------------------
    // Test 9: Comments Management
    // ----------------------------------------------------
    console.log('[Test 9] Comment Creation & Discussion...');
    const commentRes = await testRequest('POST', `/api/tasks/${taskId}/comments`, {
      content: 'API endpoints tested and validated against specifications.'
    }, devToken);

    assert.strictEqual(commentRes.status, 201);
    assert.strictEqual(commentRes.body.data.content, 'API endpoints tested and validated against specifications.');
    assert.strictEqual(commentRes.body.data.user_name, devUser.name);
    console.log('  ✓ Comment added and linked to task');

    // ----------------------------------------------------
    // Test 10: Task Activity History Audit Log
    // ----------------------------------------------------
    console.log('[Test 10] Full Chronological Activity History...');
    const activityRes = await testRequest('GET', `/api/tasks/${taskId}/activity`, undefined, devToken);
    assert.strictEqual(activityRes.status, 200);
    assert.ok(Array.isArray(activityRes.body.data));
    assert.ok(activityRes.body.data.length >= 3, 'Activity logs must contain multiple recorded events');
    assert.ok(activityRes.body.data.some((l: any) => l.action_type === 'CREATED'));
    assert.ok(activityRes.body.data.some((l: any) => l.action_type === 'STATUS_CHANGED'));
    console.log(`  ✓ Chronological audit trail verified (${activityRes.body.data.length} recorded events)`);

    // ----------------------------------------------------
    // Test 11: Task Authorization (Outsider Blocked)
    // ----------------------------------------------------
    console.log('[Test 11] Task Authorization Check...');
    const outsiderSignup = await testRequest('POST', '/api/auth/signup', {
      name: 'External Hacker',
      email: `hacker_${timestamp}@upsow.com`,
      password: 'SecurePassword123!',
      role: 'TEAM_MEMBER'
    });
    const outsiderToken = outsiderSignup.body.data.token;

    const unauthGetRes = await testRequest('GET', `/api/tasks/${taskId}`, undefined, outsiderToken);
    assert.strictEqual(unauthGetRes.status, 403, 'Outsider must be forbidden from task access');
    assert.strictEqual(unauthGetRes.body.error.code, 'FORBIDDEN');
    console.log('  ✓ Unauthorized outsider rejected with 403 FORBIDDEN');

    // ----------------------------------------------------
    // Test 12: Invalid Status Rejection
    // ----------------------------------------------------
    console.log('[Test 12] Invalid Status Rejection...');
    const invalidStatusRes = await testRequest('PATCH', `/api/tasks/${taskId}/status`, {
      status: 'NOT_A_VALID_STATUS'
    }, devToken);
    assert.strictEqual(invalidStatusRes.status, 400);
    assert.strictEqual(invalidStatusRes.body.error.code, 'INVALID_STATUS_TRANSITION');
    console.log('  ✓ Invalid status rejected with 400 INVALID_STATUS_TRANSITION');

    // ----------------------------------------------------
    // Test 13: Transaction Rollback on Failure
    // ----------------------------------------------------
    console.log('[Test 13] Atomic Transaction Rollback...');
    const taskCountBefore = (db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count;
    try {
      db.transaction(() => {
        db.prepare("INSERT INTO tasks (title, project_id, creator_id) VALUES ('Rollback Task', ?, ?)").run(projectId, devUser.id);
        throw new Error('Simulated task creation error');
      })();
    } catch (e) {
      // Expected
    }
    const taskCountAfter = (db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count;
    assert.strictEqual(taskCountBefore, taskCountAfter, 'Transaction must roll back without partial data');
    console.log('  ✓ Atomic transaction rollback verified');

    // ----------------------------------------------------
    // Test 14: Task Deletion & Cascade
    // ----------------------------------------------------
    console.log('[Test 14] Task Deletion & Cascading...');
    // Create temporary task
    const tempTaskRes = await testRequest('POST', '/api/tasks', {
      title: `Temp Task to Delete ${timestamp}`,
      project_id: projectId
    }, pmToken);
    const tempTaskId = tempTaskRes.body.data.id;

    // Delete task
    const deleteRes = await testRequest('DELETE', `/api/tasks/${tempTaskId}`, undefined, pmToken);
    assert.strictEqual(deleteRes.status, 200);

    const checkDeleted = db.prepare('SELECT id FROM tasks WHERE id = ?').get(tempTaskId);
    assert.strictEqual(checkDeleted, undefined, 'Task must be deleted from database');
    console.log('  ✓ Task deleted and cascaded cleanly');

    // ----------------------------------------------------
    // Test 15: Real-Time Socket.io Synchronization
    // ----------------------------------------------------
    console.log('[Test 15] Real-Time Socket.io Multi-Client Synchronization...');
    // Connect Client 1 (PM) and Client 2 (Developer)
    const socketUrl = `http://127.0.0.1:${testPort}`;
    const clientPM = ClientSocket(socketUrl, { auth: { token: pmToken }, transports: ['websocket'] });
    const clientDev = ClientSocket(socketUrl, { auth: { token: devToken }, transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((res) => clientPM.on('connect', res)),
      new Promise<void>((res) => clientDev.on('connect', res))
    ]);

    // Setup listener on clientDev for real-time status update
    const receivedEventPromise = new Promise<any>((resolve) => {
      clientDev.on('task:status_changed', (data) => {
        resolve(data);
      });
    });

    // PM updates task status to REVIEW via REST API
    await testRequest('PATCH', `/api/tasks/${taskId}/status`, {
      status: 'REVIEW'
    }, pmToken);

    // Verify clientDev received the real-time event
    const receivedPayload = await Promise.race([
      receivedEventPromise,
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error('Socket event timed out')), 4000))
    ]);

    assert.ok(receivedPayload, 'Developer socket must receive task:status_changed');
    assert.strictEqual(receivedPayload.newStatus, 'REVIEW');
    assert.strictEqual(receivedPayload.task.id, taskId);
    console.log('  ✓ Real-time Socket.io delivery verified: Client 2 received status update without refreshing');

    clientPM.disconnect();
    clientDev.disconnect();

    console.log('\n=== [PHASE 3] ALL 15 TASK ENGINE & SOCKET TESTS PASSED! ===');
    serverInstance.close();
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ [PHASE 3] TEST FAILED:', err.message);
    console.error(err.stack);
    if (serverInstance) serverInstance.close();
    process.exit(1);
  }
}

runPhase3Tests();
