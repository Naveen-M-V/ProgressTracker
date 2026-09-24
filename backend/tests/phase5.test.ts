import assert from 'assert';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';
import { app, server } from '../src/index.js';
import { io as ClientSocket } from 'socket.io-client';
import http from 'http';

console.log('=== [PHASE 5] RUNNING NOTIFICATIONS & DEADLINE REMINDER TESTS ===\n');

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

async function runPhase5Tests() {
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

    const opsSignup = await testRequest('POST', '/api/auth/signup', {
      name: 'Operations Head',
      email: `ops_${timestamp}@upsow.com`,
      password: 'Operations@123'
    });
    const opsToken = opsSignup.body.data.token;
    const opsUser = opsSignup.body.data.user;

    // Create target project with pmUser as manager and devUser, opsUser as members
    const createProjRes = await testRequest('POST', '/api/projects', {
      name: `Phase 5 Project ${timestamp}`,
      manager_id: pmUser.id,
      member_ids: [devUser.id, opsUser.id]
    }, adminToken);
    const projectId = createProjRes.body.data.id;

    // ----------------------------------------------------
    // Test 1: Task Assignment Notification Generation
    // ----------------------------------------------------
    console.log('[Test 1] Automated Notification on Task Assignment...');
    // PM creates and assigns task to developer
    const createTaskRes = await testRequest('POST', '/api/tasks', {
      title: `Feature Alpha Engine ${timestamp}`,
      description: 'Implement notification triggers',
      project_id: projectId,
      priority: 'HIGH',
      status: 'TODO',
      assignee_id: devUser.id
    }, pmToken);

    assert.strictEqual(createTaskRes.status, 201);
    const taskId = createTaskRes.body.data.id;

    // Developer should now have an unread notification for this assignment
    const devNotifsRes = await testRequest('GET', '/api/notifications?unread=true', undefined, devToken);
    assert.strictEqual(devNotifsRes.status, 200);
    assert.strictEqual(devNotifsRes.body.success, true);
    assert.ok(devNotifsRes.body.data.length > 0);

    const assignmentNotif = devNotifsRes.body.data.find(
      (n: any) => n.entity_id === taskId && n.type === 'TASK_ASSIGNED'
    );
    assert.ok(assignmentNotif, 'Assignment notification must be created for the assignee');
    assert.strictEqual(assignmentNotif.recipient_id, devUser.id);
    assert.strictEqual(assignmentNotif.is_read, false);
    console.log('  ✓ Task assignment notification generated and retrieved for assignee');

    // ----------------------------------------------------
    // Test 2: Unread Count Calculation
    // ----------------------------------------------------
    console.log('[Test 2] Unread Notification Count...');
    const countRes = await testRequest('GET', '/api/notifications/unread-count', undefined, devToken);
    assert.strictEqual(countRes.status, 200);
    assert.strictEqual(countRes.body.success, true);
    assert.ok(countRes.body.data.count >= 1, 'Unread count should be >= 1');
    const initialUnreadCount = countRes.body.data.count;
    console.log(`  ✓ Unread count verified (${initialUnreadCount} unread)`);

    // ----------------------------------------------------
    // Test 3: Mark Notification as Read
    // ----------------------------------------------------
    console.log('[Test 3] Mark Single Notification as Read...');
    const markReadRes = await testRequest('PATCH', `/api/notifications/${assignmentNotif.id}/read`, undefined, devToken);
    assert.strictEqual(markReadRes.status, 200);
    assert.strictEqual(markReadRes.body.success, true);
    assert.strictEqual(markReadRes.body.data.is_read, true);

    // Verify unread count decremented
    const countAfterRes = await testRequest('GET', '/api/notifications/unread-count', undefined, devToken);
    assert.strictEqual(countAfterRes.body.data.count, initialUnreadCount - 1);
    console.log('  ✓ Notification marked read and unread count decremented');

    // ----------------------------------------------------
    // Test 4: Mark All Notifications as Read
    // ----------------------------------------------------
    console.log('[Test 4] Mark All Notifications as Read...');
    // Create another notification for developer
    await testRequest('PATCH', `/api/tasks/${taskId}/assign`, { assignee_id: devUser.id }, pmToken);

    const markAllRes = await testRequest('PATCH', '/api/notifications/read-all', undefined, devToken);
    assert.strictEqual(markAllRes.status, 200);
    assert.strictEqual(markAllRes.body.success, true);

    const finalCountRes = await testRequest('GET', '/api/notifications/unread-count', undefined, devToken);
    assert.strictEqual(finalCountRes.body.data.count, 0, 'All notifications must be marked read');
    console.log('  ✓ All notifications marked as read (unread count = 0)');

    // ----------------------------------------------------
    // Test 5: Status Change Notification (Creator & Assignee)
    // ----------------------------------------------------
    console.log('[Test 5] Automated Notification on Status Transition...');
    // Developer starts the task (TODO -> IN_PROGRESS)
    const statusRes = await testRequest('PATCH', `/api/tasks/${taskId}/status`, { status: 'IN_PROGRESS' }, devToken);
    assert.strictEqual(statusRes.status, 200);

    // PM (creator) should receive a notification that status changed
    const pmNotifsRes = await testRequest('GET', '/api/notifications?unread=true', undefined, pmToken);
    assert.strictEqual(pmNotifsRes.status, 200);
    const statusNotif = pmNotifsRes.body.data.find(
      (n: any) => n.entity_id === taskId && n.type === 'TASK_STATUS_CHANGED'
    );
    assert.ok(statusNotif, 'Task creator (PM) must receive notification when status changes');
    console.log('  ✓ Task status change notification generated for creator');

    // ----------------------------------------------------
    // Test 6: Comment Added Notification with Watchers
    // ----------------------------------------------------
    console.log('[Test 6] Comment Added Notification...');
    // Developer adds a comment
    const commentRes = await testRequest('POST', `/api/tasks/${taskId}/comments`, {
      content: 'I have started implementing the event dispatcher triggers.'
    }, devToken);
    assert.strictEqual(commentRes.status, 201);

    // PM should receive comment notification
    const pmCommentNotifs = await testRequest('GET', '/api/notifications', undefined, pmToken);
    const commentNotif = pmCommentNotifs.body.data.find(
      (n: any) => n.entity_id === taskId && n.type === 'TASK_COMMENT_ADDED'
    );
    assert.ok(commentNotif, 'PM must receive notification for the new comment');
    assert.ok(commentNotif.message.includes('started implementing'));
    console.log('  ✓ Comment notification created with preview snippet');

    // ----------------------------------------------------
    // Test 7: Deadline Reminder Engine - Due Today & Overdue
    // ----------------------------------------------------
    console.log('[Test 7] Deadline Reminder Engine...');
    const todayStr = new Date().toISOString().split('T')[0];

    // Create a task due today
    const dueTodayTask = await testRequest('POST', '/api/tasks', {
      title: `Critical Bug Fix ${timestamp}`,
      project_id: projectId,
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      assignee_id: devUser.id,
      due_date: todayStr
    }, pmToken);
    assert.strictEqual(dueTodayTask.status, 201);
    const dueTodayId = dueTodayTask.body.data.id;

    // Create an overdue task (due 3 days ago)
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const overdueTask = await testRequest('POST', '/api/tasks', {
      title: `Overdue Deliverable ${timestamp}`,
      project_id: projectId,
      priority: 'HIGH',
      status: 'TODO',
      assignee_id: opsUser.id,
      due_date: pastDate
    }, pmToken);
    assert.strictEqual(overdueTask.status, 201);
    const overdueId = overdueTask.body.data.id;

    // Run the reminder engine
    const runReminderRes = await testRequest('POST', '/api/notifications/reminders/run', undefined, adminToken);
    assert.strictEqual(runReminderRes.status, 200);
    assert.strictEqual(runReminderRes.body.success, true);
    assert.ok(runReminderRes.body.data.remindersCreated >= 2, 'Should create reminders for due today and overdue tasks');

    // Verify Developer received "Due Today" alert
    const devDueToday = await testRequest('GET', '/api/notifications', undefined, devToken);
    const dueTodayAlert = devDueToday.body.data.find(
      (n: any) => n.entity_id === dueTodayId && n.type === 'DEADLINE_REMINDER'
    );
    assert.ok(dueTodayAlert, 'Developer must receive Due Today alert');
    assert.ok(dueTodayAlert.title.includes('Due Today'));

    // Verify Operations received "Overdue" alert
    const opsOverdue = await testRequest('GET', '/api/notifications', undefined, opsToken);
    const overdueAlert = opsOverdue.body.data.find(
      (n: any) => n.entity_id === overdueId && n.type === 'DEADLINE_REMINDER'
    );
    assert.ok(overdueAlert, 'Operations Head must receive Overdue alert');
    assert.ok(overdueAlert.title.includes('Overdue'));
    console.log('  ✓ Deadline reminder engine successfully identified Due Today and Overdue tasks');

    // ----------------------------------------------------
    // Test 8: Deadline Reminder Idempotency (No Duplicate Spam)
    // ----------------------------------------------------
    console.log('[Test 8] Deadline Reminder Idempotency...');
    // Running the scan again immediately should create 0 duplicate reminders
    const runAgainRes = await testRequest('POST', '/api/notifications/reminders/run', undefined, adminToken);
    assert.strictEqual(runAgainRes.status, 200);
    assert.strictEqual(runAgainRes.body.data.remindersCreated, 0, 'No duplicate reminders should be created on same day');
    console.log('  ✓ Idempotency verified: 0 duplicate reminders sent on subsequent scan');

    // ----------------------------------------------------
    // Test 9: Real-time Socket.io Notification Delivery
    // ----------------------------------------------------
    console.log('[Test 9] Real-Time Socket.io Notification Delivery...');
    const clientDevSocket = ClientSocket(`http://127.0.0.1:${testPort}`, {
      auth: { token: devToken },
      transports: ['websocket']
    });

    await new Promise<void>((resolve, reject) => {
      clientDevSocket.on('connect', () => resolve());
      clientDevSocket.on('connect_error', (err) => reject(err));
    });

    const notificationReceivedPromise = new Promise<any>((resolve) => {
      clientDevSocket.on('notification:created', (payload) => {
        resolve(payload);
      });
    });

    // PM assigns another task to developer
    const assignNewTask = await testRequest('POST', '/api/tasks', {
      title: `Realtime Alert Task ${timestamp}`,
      project_id: projectId,
      priority: 'MEDIUM',
      status: 'TODO',
      assignee_id: devUser.id
    }, pmToken);
    assert.strictEqual(assignNewTask.status, 201);

    const receivedNotification = await Promise.race([
      notificationReceivedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Socket notification delivery timed out')), 4000))
    ]);

    assert.ok(receivedNotification, 'Notification must be received over Socket.io');
    assert.strictEqual(receivedNotification.recipient_id, devUser.id);
    assert.strictEqual(receivedNotification.entity_id, assignNewTask.body.data.id);
    clientDevSocket.disconnect();
    console.log('  ✓ Real-time Socket.io notification received on user socket room');

    // ----------------------------------------------------
    // Test 10: Notification Security & Isolation
    // ----------------------------------------------------
    console.log('[Test 10] Notification Security & Isolation...');
    // Developer tries to mark Operations Head's notification as read
    const opsNotif = overdueAlert.id;
    const unauthorizedMark = await testRequest('PATCH', `/api/notifications/${opsNotif}/read`, undefined, devToken);
    assert.strictEqual(unauthorizedMark.status, 403, 'Must reject modifying another user notification with 403 FORBIDDEN');

    // Developer tries to delete Operations Head's notification
    const unauthorizedDelete = await testRequest('DELETE', `/api/notifications/${opsNotif}`, undefined, devToken);
    assert.strictEqual(unauthorizedDelete.status, 403, 'Must reject deleting another user notification with 403 FORBIDDEN');
    console.log('  ✓ Cross-user notification tampering strictly blocked with 403 FORBIDDEN');

    console.log('\n=== [PHASE 5] ALL 10 NOTIFICATIONS & DEADLINE REMINDER TESTS PASSED! ===\n');

    if (serverInstance && !process.env.KEEP_SERVER_OPEN) {
      serverInstance.close();
    }
  } catch (error) {
    console.error('\n❌ [PHASE 5] TEST FAILED:', error);
    if (serverInstance) {
      serverInstance.close();
    }
    process.exit(1);
  }
}

runPhase5Tests();
