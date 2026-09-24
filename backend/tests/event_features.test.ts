import assert from 'assert';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';
import { AuthService } from '../src/services/auth.service.js';
import { TaskService } from '../src/services/task.service.js';
import { ProjectService } from '../src/services/project.service.js';
import { app } from '../src/index.js';
import http from 'http';

console.log('=== RUNNING EVENT AND TASK CREATION TESTS ===\n');

async function testRequest(
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address() as any;
      const port = address.port;

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
          port,
          path,
          method,
          headers
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            server.close();
            try {
              const parsed = JSON.parse(data);
              resolve({ status: res.statusCode || 500, body: parsed });
            } catch (e) {
              resolve({ status: res.statusCode || 500, body: data });
            }
          });
        }
      );

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });
}

async function runTests() {
  await initializeDatabase();
  await seedDatabase();

  const adminAuth = await AuthService.login({ email: 'admin@upsow.com', password: 'Admin@123' });
  const adminToken = adminAuth.token;
  const adminUser = adminAuth.user;

  // Ensure a test project exists
  let project = await db.queryOne('SELECT * FROM projects LIMIT 1');
  if (!project) {
    project = await ProjectService.createProject({ name: 'Event Test Project', description: 'Testing events' }, adminUser);
  }

  console.log('1. Testing standard task creation (item_type = TASK, start & due date)...');
  const taskRes = await testRequest('POST', '/api/tasks', {
    title: 'Standard Roadmap Task',
    project_id: project.id,
    start_date: '2026-09-24',
    due_date: '2026-09-30',
    item_type: 'TASK',
    priority: 'HIGH'
  }, adminToken);

  assert.strictEqual(taskRes.status, 201, 'Task should be created successfully');
  assert.strictEqual(taskRes.body.data.item_type, 'TASK', 'item_type should be TASK');
  assert.strictEqual(taskRes.body.data.start_date, '2026-09-24', 'start_date should be preserved for tasks');
  assert.strictEqual(taskRes.body.data.due_date, '2026-09-30', 'due_date should be preserved for tasks');
  console.log('✓ Task created successfully with start_date and due_date.');

  console.log('2. Testing event creation (item_type = EVENT, single date, start_date = null)...');
  const eventRes = await testRequest('POST', '/api/tasks', {
    title: 'Client Demo & Release Presentation',
    project_id: project.id,
    due_date: '2026-10-05',
    item_type: 'EVENT',
    priority: 'URGENT'
  }, adminToken);

  assert.strictEqual(eventRes.status, 201, 'Event should be created successfully');
  assert.strictEqual(eventRes.body.data.item_type, 'EVENT', 'item_type should be EVENT');
  assert.strictEqual(eventRes.body.data.due_date, '2026-10-05', 'Event single date should be 2026-10-05');
  assert.strictEqual(eventRes.body.data.start_date, null, 'Event start_date should be null (single date only)');
  console.log('✓ Event created successfully with single date.');

  console.log('3. Testing filtering by item_type...');
  const tasksOnlyRes = await testRequest('GET', `/api/tasks?project_id=${project.id}&item_type=TASK`, undefined, adminToken);
  assert.strictEqual(tasksOnlyRes.status, 200);
  assert(tasksOnlyRes.body.data.every((t: any) => t.item_type === 'TASK'), 'All filtered items should be TASK');

  const eventsOnlyRes = await testRequest('GET', `/api/tasks?project_id=${project.id}&item_type=EVENT`, undefined, adminToken);
  assert.strictEqual(eventsOnlyRes.status, 200);
  assert(eventsOnlyRes.body.data.every((t: any) => t.item_type === 'EVENT'), 'All filtered items should be EVENT');
  assert(eventsOnlyRes.body.data.some((e: any) => e.title === 'Client Demo & Release Presentation'), 'Event should be in results');
  console.log('✓ Filtering by item_type works as expected.');

  console.log('4. Testing activity log message for event creation...');
  const eventDetail = await TaskService.getTaskById(eventRes.body.data.id, adminUser);
  const createdLog = eventDetail.activity_logs.find((l: any) => l.action_type === 'CREATED');
  assert(createdLog, 'Activity log should exist');
  assert(createdLog.description.includes('created the event'), 'Activity log description should mention event');
  console.log('✓ Activity log correctly records event creation.');

  console.log('\n=== ALL EVENT & TASK TESTS PASSED SUCCESSFULLY! ===\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
