import assert from 'assert';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';
import { app, server } from '../src/index.js';
import http from 'http';

console.log('=== [PHASE 6] RUNNING SHARED CALENDAR, MY WORK & MULTI-FILTER TESTS ===\n');

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

async function runPhase6Tests() {
  try {
    initializeDatabase();
    seedDatabase();

    // Ensure server is listening on an active port
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

    const opsLogin = await testRequest('POST', '/api/auth/login', { email: 'operationhead@upsow.com', password: 'Operations@123' });
    const opsToken = opsLogin.body.data.token;
    const opsUser = opsLogin.body.data.user;

    const timestamp = Date.now();

    // Fetch Development team (ID: 1) and Operations team (ID: 2)
    const devTeam = db.prepare("SELECT id FROM teams WHERE name = 'Development'").get() as { id: number };
    const opsTeam = db.prepare("SELECT id FROM teams WHERE name = 'Operations'").get() as { id: number };
    assert.ok(devTeam && opsTeam, 'Teams must exist');

    // Fetch flagship UPSOW project
    const upsowProject = db.prepare("SELECT id FROM projects WHERE name = 'UPSOW'").get() as { id: number };
    const projectId = upsowProject.id;

    // ----------------------------------------------------
    // Test 1: Role-Based Project Creation Permissions
    // ----------------------------------------------------
    console.log('[Test 1] Project Creation RBAC Check...');
    // PM creates a project successfully
    const pmCreateProj = await testRequest('POST', '/api/projects', {
      name: `Calendar Portal ${timestamp}`,
      description: 'Project created for calendar validation',
      team_id: devTeam.id,
      manager_id: pmUser.id
    }, pmToken);
    assert.strictEqual(pmCreateProj.status, 201);
    const newProjectId = pmCreateProj.body.data.id;

    // Team Member attempts project creation -> must be rejected with 403 FORBIDDEN
    const devCreateProj = await testRequest('POST', '/api/projects', {
      name: `Unauthorized Project ${timestamp}`,
      team_id: devTeam.id
    }, devToken);
    assert.strictEqual(devCreateProj.status, 403, 'Team member must be blocked from creating projects');
    console.log('  ✓ PM successfully created project; Team Member blocked with 403 FORBIDDEN');

    // ----------------------------------------------------
    // Test 2: Project-Level Team Isolation
    // ----------------------------------------------------
    console.log('[Test 2] Project-Level Team Isolation...');
    // PM creates project assigned exclusively to Operations team
    const opsOnlyProj = await testRequest('POST', '/api/projects', {
      name: `Ops Secret Infrastructure ${timestamp}`,
      description: 'Internal operations infrastructure',
      team_id: opsTeam.id,
      manager_id: pmUser.id
    }, pmToken);
    assert.strictEqual(opsOnlyProj.status, 201);
    const opsOnlyProjId = opsOnlyProj.body.data.id;

    // Operations Head can view this project
    const opsView = await testRequest('GET', `/api/projects/${opsOnlyProjId}`, undefined, opsToken);
    assert.strictEqual(opsView.status, 200);

    // Developer (not in Operations team or project members) gets 403 FORBIDDEN
    const devView = await testRequest('GET', `/api/projects/${opsOnlyProjId}`, undefined, devToken);
    assert.strictEqual(devView.status, 403, 'Developer must not access unassigned Operations project');
    console.log('  ✓ Operations team has access; Developer strictly denied access with 403 FORBIDDEN');

    // ----------------------------------------------------
    // Test 3: Seed Scheduled Tasks with Varied Dates & Attributes
    // ----------------------------------------------------
    console.log('[Test 3] Creating Calendar Tasks with Varied Dates & Priorities...');
    // Task A: Dev in UPSOW, Urgent, Scheduled in October 2026
    const taskA = await testRequest('POST', '/api/tasks', {
      title: `Optimize DB Query Latency ${timestamp}`,
      project_id: projectId,
      team_id: devTeam.id,
      assignee_id: devUser.id,
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      start_date: '2026-10-01',
      due_date: '2026-10-05'
    }, pmToken);
    assert.strictEqual(taskA.status, 201);

    // Task B: Dev in UPSOW, Low Priority, Scheduled in October 2026
    const taskB = await testRequest('POST', '/api/tasks', {
      title: `Update API Documentation ${timestamp}`,
      project_id: projectId,
      team_id: devTeam.id,
      assignee_id: devUser.id,
      priority: 'LOW',
      status: 'TODO',
      start_date: '2026-10-10',
      due_date: '2026-10-15'
    }, pmToken);
    assert.strictEqual(taskB.status, 201);

    // Task C: Ops in UPSOW, Medium Priority, Scheduled in November 2026
    const taskC = await testRequest('POST', '/api/tasks', {
      title: `Deploy Multi-Region Backup ${timestamp}`,
      project_id: projectId,
      team_id: opsTeam.id,
      assignee_id: opsUser.id,
      priority: 'MEDIUM',
      status: 'TODO',
      start_date: '2026-11-01',
      due_date: '2026-11-05'
    }, pmToken);
    assert.strictEqual(taskC.status, 201);
    console.log('  ✓ Tasks created across dates, teams, priorities, and assignees');

    // ----------------------------------------------------
    // Test 4: Multi-Faceted Filter (Project + Team)
    // ----------------------------------------------------
    console.log('[Test 4] Multi-Filter by Project + Team...');
    const filterProjTeam = await testRequest(
      'GET',
      `/api/tasks?project_id=${projectId}&team_id=${devTeam.id}`,
      undefined,
      adminToken
    );
    assert.strictEqual(filterProjTeam.status, 200);
    assert.ok(filterProjTeam.body.data.length >= 2);
    for (const t of filterProjTeam.body.data) {
      assert.strictEqual(t.project_id, projectId);
      assert.strictEqual(t.team_id, devTeam.id);
    }
    console.log('  ✓ Multi-filter by Project + Team returned only matching tasks');

    // ----------------------------------------------------
    // Test 5: Multi-Faceted Filter (Team + Person / Assignee)
    // ----------------------------------------------------
    console.log('[Test 5] Multi-Filter by Team + Person (Assignee)...');
    const filterTeamPerson = await testRequest(
      'GET',
      `/api/tasks?team_id=${opsTeam.id}&assignee_id=${opsUser.id}`,
      undefined,
      adminToken
    );
    assert.strictEqual(filterTeamPerson.status, 200);
    assert.ok(filterTeamPerson.body.data.length >= 1);
    for (const t of filterTeamPerson.body.data) {
      assert.strictEqual(t.team_id, opsTeam.id);
      assert.strictEqual(t.assignee_id, opsUser.id);
    }
    console.log('  ✓ Multi-filter by Team + Person correctly isolated Operations assignee tasks');

    // ----------------------------------------------------
    // Test 6: 4-Way Simultaneous Filter (Project + Team + Person + Status)
    // ----------------------------------------------------
    console.log('[Test 6] 4-Way Simultaneous Filter (Project + Team + Person + Status)...');
    const fourWayFilter = await testRequest(
      'GET',
      `/api/tasks?project_id=${projectId}&team_id=${devTeam.id}&assignee_id=${devUser.id}&status=IN_PROGRESS`,
      undefined,
      devToken
    );
    assert.strictEqual(fourWayFilter.status, 200);
    assert.ok(fourWayFilter.body.data.length >= 1);
    const foundTaskA = fourWayFilter.body.data.find((t: any) => t.id === taskA.body.data.id);
    assert.ok(foundTaskA, 'Task A must match all 4 simultaneous criteria');
    for (const t of fourWayFilter.body.data) {
      assert.strictEqual(t.project_id, projectId);
      assert.strictEqual(t.team_id, devTeam.id);
      assert.strictEqual(t.assignee_id, devUser.id);
      assert.strictEqual(t.status, 'IN_PROGRESS');
    }
    console.log('  ✓ 4-Way simultaneous filter query verified accurately');

    // ----------------------------------------------------
    // Test 7: Calendar Date Range Query (from_date & to_date)
    // ----------------------------------------------------
    console.log('[Test 7] Calendar Date Range Query (Month of October 2026)...');
    const octRangeRes = await testRequest(
      'GET',
      `/api/tasks?project_id=${projectId}&from_date=2026-10-01&to_date=2026-10-31`,
      undefined,
      adminToken
    );
    assert.strictEqual(octRangeRes.status, 200);
    const octTasks = octRangeRes.body.data;
    assert.ok(octTasks.some((t: any) => t.id === taskA.body.data.id), 'Task A (Oct 1-5) must be included');
    assert.ok(octTasks.some((t: any) => t.id === taskB.body.data.id), 'Task B (Oct 10-15) must be included');
    assert.ok(!octTasks.some((t: any) => t.id === taskC.body.data.id), 'Task C (November) must be excluded from October query');
    console.log('  ✓ Calendar date range query correctly constrained tasks to target month window');

    // ----------------------------------------------------
    // Test 8: My Work Personal View Query
    // ----------------------------------------------------
    console.log('[Test 8] My Work Personal Tasks Query...');
    const myWorkRes = await testRequest(
      'GET',
      `/api/tasks?assignee_id=${devUser.id}`,
      undefined,
      devToken
    );
    assert.strictEqual(myWorkRes.status, 200);
    for (const t of myWorkRes.body.data) {
      assert.strictEqual(t.assignee_id, devUser.id);
    }
    console.log(`  ✓ My Work query verified (retrieved ${myWorkRes.body.data.length} personal tasks for Developer)`);

    console.log('\n=== [PHASE 6] ALL 8 CALENDAR, MY WORK & FILTER TESTS PASSED! ===\n');

    if (serverInstance && !process.env.KEEP_SERVER_OPEN) {
      serverInstance.close();
    }
  } catch (error) {
    console.error('\n❌ [PHASE 6] TEST FAILED:', error);
    if (serverInstance) {
      serverInstance.close();
    }
    process.exit(1);
  }
}

runPhase6Tests();
