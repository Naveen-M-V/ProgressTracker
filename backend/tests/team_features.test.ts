import assert from 'assert';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';
import { AuthService } from '../src/services/auth.service.js';
import { TeamService } from '../src/services/team.service.js';
import { ProjectService } from '../src/services/project.service.js';
import { TaskService } from '../src/services/task.service.js';
import { app } from '../src/index.js';
import http from 'http';

console.log('=== RUNNING TEAM RBAC & MULTI-TEAM ISOLATION TESTS ===\n');

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
  try {
    console.log('1. Initializing DB schema...');
    await initializeDatabase();

    // Setup test users
    const timestamp = Date.now();
    const adminUser = await AuthService.signup({
      name: 'Admin Tester',
      email: `admin_${timestamp}@test.com`,
      password: 'Password123!',
      role: 'ADMIN'
    });
    const pmUser = await AuthService.signup({
      name: 'PM Tester',
      email: `pm_${timestamp}@test.com`,
      password: 'Password123!',
      role: 'PROJECT_MANAGER'
    });
    const aliceUser = await AuthService.signup({
      name: 'Alice MultiTeam',
      email: `alice_${timestamp}@test.com`,
      password: 'Password123!',
      role: 'TEAM_MEMBER'
    });
    const bobUser = await AuthService.signup({
      name: 'Bob SingleTeam',
      email: `bob_${timestamp}@test.com`,
      password: 'Password123!',
      role: 'TEAM_MEMBER'
    });

    console.log('✓ Test users created.');

    // Create 3 teams
    const teamAlpha = await TeamService.createTeam(
      { name: `Team Alpha ${timestamp}`, description: 'Alpha Team' },
      adminUser.user
    );
    const teamBeta = await TeamService.createTeam(
      { name: `Team Beta ${timestamp}`, description: 'Beta Team' },
      adminUser.user
    );
    const teamGamma = await TeamService.createTeam(
      { name: `Team Gamma ${timestamp}`, description: 'Gamma Team' },
      adminUser.user
    );

    console.log('✓ Teams created: Alpha, Beta, Gamma.');

    // Alice belongs to Team Alpha AND Team Beta (Multi-team)
    await TeamService.addMember(teamAlpha.id, aliceUser.user.id, adminUser.user);
    await TeamService.addMember(teamBeta.id, aliceUser.user.id, adminUser.user);

    // Bob belongs to Team Gamma only
    await TeamService.addMember(teamGamma.id, bobUser.user.id, adminUser.user);

    console.log('✓ Team membership assigned: Alice in (Alpha, Beta), Bob in (Gamma).');

    // Create shared project managed by PM, with all members in project
    const project = await ProjectService.createProject(
      {
        name: `RBAC Test Project ${timestamp}`,
        description: 'Testing team isolation',
        manager_id: pmUser.user.id,
        member_ids: [aliceUser.user.id, bobUser.user.id]
      },
      adminUser.user
    );

    console.log('✓ Shared project created with Alice & Bob as project members.');

    // Verify team listing has correct is_member flags
    const aliceTeams = await TeamService.getAllTeams(aliceUser.user);
    const aliceAlpha = aliceTeams.find((t) => t.id === teamAlpha.id);
    const aliceBeta = aliceTeams.find((t) => t.id === teamBeta.id);
    const aliceGamma = aliceTeams.find((t) => t.id === teamGamma.id);

    assert.strictEqual(aliceAlpha?.is_member, true, 'Alice should be recognized as member of Team Alpha');
    assert.strictEqual(aliceBeta?.is_member, true, 'Alice should be recognized as member of Team Beta');
    assert.strictEqual(aliceGamma, undefined, 'Alice should NOT see foreign Team Gamma at all');

    console.log('✓ TeamService.getAllTeams correctly scopes teams: only member teams returned, foreign teams hidden.');

    // Create Tasks:
    // Task 1: Assigned to Team Alpha
    const taskAlpha = await TaskService.createTask(
      {
        title: 'Alpha Team Task',
        project_id: project.id,
        team_id: teamAlpha.id,
        priority: 'HIGH'
      },
      adminUser.user
    );

    // Task 2: Assigned to Team Beta (Event)
    const eventBeta = await TaskService.createTask(
      {
        title: 'Beta Team Milestone Event',
        project_id: project.id,
        team_id: teamBeta.id,
        item_type: 'EVENT',
        due_date: '2026-10-15'
      },
      adminUser.user
    );

    // Task 3: Assigned to Team Gamma
    const taskGamma = await TaskService.createTask(
      {
        title: 'Gamma Team Task',
        project_id: project.id,
        team_id: teamGamma.id,
        priority: 'MEDIUM'
      },
      adminUser.user
    );

    // Task 4: Unassigned project task (general milestone)
    const taskUnassigned = await TaskService.createTask(
      {
        title: 'General Project Deliverable',
        project_id: project.id,
        priority: 'LOW'
      },
      adminUser.user
    );

    console.log('✓ Created 4 tasks: Alpha Task, Beta Event, Gamma Task, Unassigned Task.');

    // 2. Query tasks as Alice (Multi-team: Alpha & Beta)
    const aliceTasks = await TaskService.getTasks({ project_id: project.id }, aliceUser.user);
    const aliceTaskIds = aliceTasks.map((t) => t.id);

    assert.strictEqual(aliceTaskIds.includes(taskAlpha.id), true, 'Alice MUST see Team Alpha task');
    assert.strictEqual(aliceTaskIds.includes(eventBeta.id), true, 'Alice MUST see Team Beta event');
    assert.strictEqual(aliceTaskIds.includes(taskUnassigned.id), true, 'Alice MUST see unassigned task');
    assert.strictEqual(aliceTaskIds.includes(taskGamma.id), false, 'Alice MUST NOT see Team Gamma task');

    console.log('✓ Alice sees tasks from BOTH Team Alpha & Team Beta, plus unassigned. Gamma task is isolated!');

    // 3. Query tasks as Bob (Gamma only)
    const bobTasks = await TaskService.getTasks({ project_id: project.id }, bobUser.user);
    const bobTaskIds = bobTasks.map((t) => t.id);

    assert.strictEqual(bobTaskIds.includes(taskGamma.id), true, 'Bob MUST see Team Gamma task');
    assert.strictEqual(bobTaskIds.includes(taskUnassigned.id), true, 'Bob MUST see unassigned task');
    assert.strictEqual(bobTaskIds.includes(taskAlpha.id), false, 'Bob MUST NOT see Team Alpha task');
    assert.strictEqual(bobTaskIds.includes(eventBeta.id), false, 'Bob MUST NOT see Team Beta event');

    console.log('✓ Bob sees only Team Gamma task and unassigned task. Alpha & Beta are isolated from Bob!');

    // 4. Query tasks as PM (before team assignment): PM only sees unassigned tasks, foreign teams are isolated
    const pmTasks = await TaskService.getTasks({ project_id: project.id }, pmUser.user);
    const pmTaskIds = pmTasks.map((t) => t.id);

    assert.strictEqual(pmTaskIds.includes(taskUnassigned.id), true, 'PM must see Unassigned task');
    assert.strictEqual(pmTaskIds.includes(taskAlpha.id), false, 'PM without team must NOT see foreign Alpha task');
    assert.strictEqual(pmTaskIds.includes(eventBeta.id), false, 'PM without team must NOT see foreign Beta event');
    assert.strictEqual(pmTaskIds.includes(taskGamma.id), false, 'PM without team must NOT see foreign Gamma task');

    console.log('✓ Project Manager only sees their own team tasks & unassigned tasks; foreign teams are isolated.');

    // 5. Query tasks as Admin
    const adminTasks = await TaskService.getTasks({ project_id: project.id }, adminUser.user);
    assert.strictEqual(adminTasks.length >= 4, true, 'Admin has global visibility across all tasks');

    console.log('✓ Admin has global visibility.');

    // 6. Direct access protection: Alice attempting to access Gamma task via API (HTTP GET /api/tasks/:id)
    const getResForbidden = await testRequest(
      'GET',
      `/api/tasks/${taskGamma.id}`,
      undefined,
      aliceUser.token
    );
    assert.strictEqual(getResForbidden.status, 403, 'Alice direct GET on Team Gamma task should return 403 Forbidden');

    console.log('✓ Direct GET /api/tasks/:id returns 403 Forbidden for unauthorized team task.');

    // 7. Direct status update protection: Alice attempting to update Gamma task status
    const updateResForbidden = await testRequest(
      'PATCH',
      `/api/tasks/${taskGamma.id}/status`,
      { status: 'COMPLETED' },
      aliceUser.token
    );
    assert.strictEqual(updateResForbidden.status, 403, 'Alice direct status PATCH on Team Gamma task should return 403 Forbidden');

    console.log('✓ Direct PATCH /api/tasks/:id/status returns 403 Forbidden for unauthorized team task.');

    // 8. Direct comment protection: Alice attempting to comment on Gamma task
    const commentResForbidden = await testRequest(
      'POST',
      `/api/tasks/${taskGamma.id}/comments`,
      { content: 'Unauthorized comment' },
      aliceUser.token
    );
    assert.strictEqual(commentResForbidden.status, 403, 'Alice direct comment on Team Gamma task should return 403 Forbidden');

    console.log('✓ Direct POST /api/tasks/:id/comments returns 403 Forbidden for unauthorized team task.');

    // 9. Task creation permission check: Alice trying to assign a new task to Team Gamma
    const createForbiddenRes = await testRequest(
      'POST',
      '/api/tasks',
      {
        title: 'Alice Unauthorized Assignment',
        project_id: project.id,
        team_id: teamGamma.id
      },
      aliceUser.token
    );
    assert.strictEqual(createForbiddenRes.status, 403, 'Non-admin/non-PM assigning to foreign team should return 403');

    console.log('✓ Non-admin cannot assign tasks/events to teams they are not a member of.');

    // 10. Alice creating a task in Team Alpha (which she belongs to)
    const createSuccessRes = await testRequest(
      'POST',
      '/api/tasks',
      {
        title: 'Alice Authorized Alpha Task',
        project_id: project.id,
        team_id: teamAlpha.id
      },
      aliceUser.token
    );
    assert.strictEqual(createSuccessRes.status, 201, 'Alice creating task in her own team Alpha should succeed');

    console.log('✓ Alice successfully created a task assigned to her team (Alpha).');

    // 11. Strict Project Manager Team & Member Isolation Verification
    // Assign PM as Lead of Team Alpha
    await TeamService.updateTeam(teamAlpha.id, { lead_id: pmUser.user.id }, adminUser.user);

    // A. PM only sees their own team in getAllTeams
    const pmTeams = await TeamService.getAllTeams(pmUser.user);
    const pmTeamIds = pmTeams.map((t) => t.id);
    assert.strictEqual(pmTeamIds.includes(teamAlpha.id), true, 'PM must see Team Alpha (their own team)');
    assert.strictEqual(pmTeamIds.includes(teamGamma.id), false, 'PM must NOT see Team Gamma (foreign team)');
    console.log('✓ PM can only see their own team (Alpha). Foreign teams are completely hidden!');

    // B. Direct GET on foreign team details throws FORBIDDEN
    let pmGammaForbidden = false;
    try {
      await TeamService.getTeamById(teamGamma.id, pmUser.user);
    } catch (e: any) {
      if (e.code === 'FORBIDDEN') pmGammaForbidden = true;
    }
    assert.strictEqual(pmGammaForbidden, true, 'PM accessing foreign team details must throw FORBIDDEN');
    console.log('✓ PM direct access to foreign team details is strictly blocked (403 FORBIDDEN).');

    // C. Direct GET on foreign team roster throws FORBIDDEN
    let pmGammaMembersForbidden = false;
    try {
      await TeamService.getTeamMembers(teamGamma.id, pmUser.user);
    } catch (e: any) {
      if (e.code === 'FORBIDDEN') pmGammaMembersForbidden = true;
    }
    assert.strictEqual(pmGammaMembersForbidden, true, 'PM accessing foreign team roster must throw FORBIDDEN');
    console.log('✓ PM direct access to foreign team roster is strictly blocked (403 FORBIDDEN).');

    // D. PM user directory only returns members of their own team (plus PM)
    const pmUsers = await AuthService.getAllUsers(pmUser.user);
    const pmUserIds = pmUsers.map((u) => u.id);
    assert.strictEqual(pmUserIds.includes(pmUser.user.id), true, 'PM must see themselves');
    assert.strictEqual(pmUserIds.includes(aliceUser.user.id), true, 'PM must see Alice (member of their team Alpha)');
    assert.strictEqual(pmUserIds.includes(bobUser.user.id), false, 'PM must NOT see Bob (member of foreign team Gamma)');
    console.log('✓ PM user directory strictly isolated: only own team members (Alice) visible. Foreign members (Bob) hidden!');

    // E. PM cannot see tasks assigned to foreign teams
    const pmTasksIsolated = await TaskService.getTasks({ project_id: project.id }, pmUser.user);
    const pmIsolatedTaskIds = pmTasksIsolated.map((t) => t.id);
    assert.strictEqual(pmIsolatedTaskIds.includes(taskAlpha.id), true, 'PM must see Team Alpha tasks');
    assert.strictEqual(pmIsolatedTaskIds.includes(taskGamma.id), false, 'PM must NOT see foreign Team Gamma tasks');
    console.log('✓ PM task list strictly isolated: foreign team tasks are completely excluded!');

    console.log('\n=== ALL TEAM RBAC & MULTI-TEAM ISOLATION TESTS PASSED SUCCESSFULLY! ===\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  }
}

runTests();
