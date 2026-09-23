import assert from 'assert';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';
import { AuthService } from '../src/services/auth.service.js';
import { TeamService } from '../src/services/team.service.js';
import { ProjectService } from '../src/services/project.service.js';
import { app } from '../src/index.js';
import http from 'http';

console.log('=== [PHASE 2] RUNNING PROJECTS, TEAMS & MEMBERS TESTS ===\n');

// Helper to make test HTTP requests to express app
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

async function runPhase2Tests() {
  try {
    initializeDatabase();
    seedDatabase();

    // 1. Authenticate test actors
    const adminLogin = await testRequest('POST', '/api/auth/login', { email: 'admin@upsow.com', password: 'Admin@123' });
    const adminToken = adminLogin.body.data.token;
    const adminUser = adminLogin.body.data.user;

    const pmLogin = await testRequest('POST', '/api/auth/login', { email: 'pm@upsow.com', password: 'Manager@123' });
    const pmToken = pmLogin.body.data.token;
    const pmUser = pmLogin.body.data.user;

    const devLogin = await testRequest('POST', '/api/auth/login', { email: 'developer@upsow.com', password: 'Developer@123' });
    const devToken = devLogin.body.data.token;
    const devUser = devLogin.body.data.user;

    const designLogin = await testRequest('POST', '/api/auth/login', { email: 'design@upsow.com', password: 'Designer@123' });
    const designToken = designLogin.body.data.token;
    const designUser = designLogin.body.data.user;

    const timestamp = Date.now();

    // ----------------------------------------------------
    // Test 1: Create Team
    // ----------------------------------------------------
    console.log('[Test 1] Create Team (Admin only)...');
    const createTeamRes = await testRequest('POST', '/api/teams', {
      name: `Infrastructure Team ${timestamp}`,
      description: 'Cloud reliability and DevOps automation',
      member_ids: [devUser.id]
    }, adminToken);

    assert.strictEqual(createTeamRes.status, 201);
    assert.strictEqual(createTeamRes.body.success, true);
    assert.strictEqual(createTeamRes.body.data.name, `Infrastructure Team ${timestamp}`);
    const newTeamId = createTeamRes.body.data.id;
    console.log('  ✓ Team created with initial members (201 Created)');

    // ----------------------------------------------------
    // Test 2: Update Team
    // ----------------------------------------------------
    console.log('[Test 2] Update Team...');
    const updateTeamRes = await testRequest('PUT', `/api/teams/${newTeamId}`, {
      name: `Core Infrastructure ${timestamp}`,
      description: 'Updated description for cloud reliability'
    }, adminToken);

    assert.strictEqual(updateTeamRes.status, 200);
    assert.strictEqual(updateTeamRes.body.data.name, `Core Infrastructure ${timestamp}`);
    console.log('  ✓ Team updated successfully');

    // ----------------------------------------------------
    // Test 3: Assign Team Lead
    // ----------------------------------------------------
    console.log('[Test 3] Assign Team Lead...');
    const assignLeadRes = await testRequest('PUT', `/api/teams/${newTeamId}`, {
      lead_id: devUser.id
    }, adminToken);

    assert.strictEqual(assignLeadRes.status, 200);
    assert.strictEqual(assignLeadRes.body.data.lead_id, devUser.id);
    console.log('  ✓ Team lead assigned successfully');

    // ----------------------------------------------------
    // Test 4: Add / Remove Team Members
    // ----------------------------------------------------
    console.log('[Test 4] Add / Remove Team Members...');
    // Add Designer to team
    const addMemberRes = await testRequest('POST', `/api/teams/${newTeamId}/members`, {
      user_id: designUser.id
    }, adminToken);
    assert.strictEqual(addMemberRes.status, 201);
    assert.strictEqual(addMemberRes.body.data.user_id, designUser.id);

    // Verify member is in list
    const getMembersRes = await testRequest('GET', `/api/teams/${newTeamId}/members`, undefined, adminToken);
    assert.strictEqual(getMembersRes.status, 200);
    assert.ok(getMembersRes.body.data.some((m: any) => m.user_id === designUser.id));

    // Remove member
    const removeMemberRes = await testRequest('DELETE', `/api/teams/${newTeamId}/members/${designUser.id}`, undefined, adminToken);
    assert.strictEqual(removeMemberRes.status, 200);
    console.log('  ✓ Team member added and removed cleanly');

    // ----------------------------------------------------
    // Test 5: Create Project (PM or Admin)
    // ----------------------------------------------------
    console.log('[Test 5] Create Project (PM creates)...');
    const createProjectRes = await testRequest('POST', '/api/projects', {
      name: `Client Portal ${timestamp}`,
      description: 'External client dashboard project',
      team_id: newTeamId,
      status: 'ACTIVE',
      member_ids: [devUser.id]
    }, pmToken);

    assert.strictEqual(createProjectRes.status, 201);
    assert.strictEqual(createProjectRes.body.success, true);
    assert.strictEqual(createProjectRes.body.data.manager_id, pmUser.id, 'PM must be assigned as manager');
    const newProjectId = createProjectRes.body.data.id;
    console.log('  ✓ Project created by PM (201 Created)');

    // ----------------------------------------------------
    // Test 6: Update Project
    // ----------------------------------------------------
    console.log('[Test 6] Update Project...');
    const updateProjectRes = await testRequest('PUT', `/api/projects/${newProjectId}`, {
      description: 'Revised portal specs and milestone tracking',
      status: 'ACTIVE'
    }, pmToken);

    assert.strictEqual(updateProjectRes.status, 200);
    assert.strictEqual(updateProjectRes.body.data.description, 'Revised portal specs and milestone tracking');
    console.log('  ✓ Project updated by assigned manager');

    // ----------------------------------------------------
    // Test 7: Assign Project Team
    // ----------------------------------------------------
    console.log('[Test 7] Assign Project Team...');
    // Reassign to team 1 (Development)
    const assignTeamRes = await testRequest('PUT', `/api/projects/${newProjectId}`, {
      team_id: 1
    }, pmToken);

    assert.strictEqual(assignTeamRes.status, 200);
    assert.strictEqual(assignTeamRes.body.data.team_id, 1);
    console.log('  ✓ Project team assigned successfully');

    // ----------------------------------------------------
    // Test 8: Assign Project Manager
    // ----------------------------------------------------
    console.log('[Test 8] Assign Project Manager (Admin privilege)...');
    // Create a 2nd PM user to test reassignment
    const secondPmSignup = await testRequest('POST', '/api/auth/signup', {
      name: 'Second PM',
      email: `pm2_${timestamp}@upsow.com`,
      password: 'SecurePassword123!',
      role: 'PROJECT_MANAGER'
    });
    const secondPmId = secondPmSignup.body.data.user.id;
    const secondPmToken = secondPmSignup.body.data.token;

    // PM cannot reassign manager
    const pmReassignRes = await testRequest('PUT', `/api/projects/${newProjectId}`, {
      manager_id: secondPmId
    }, pmToken);
    assert.strictEqual(pmReassignRes.status, 403, 'Non-admin PM cannot reassign manager');

    // Admin can reassign manager
    const adminReassignRes = await testRequest('PUT', `/api/projects/${newProjectId}`, {
      manager_id: secondPmId
    }, adminToken);
    assert.strictEqual(adminReassignRes.status, 200);
    assert.strictEqual(adminReassignRes.body.data.manager_id, secondPmId);
    console.log('  ✓ Project manager reassignment properly restricted to Admin');

    // ----------------------------------------------------
    // Test 9: Add / Remove Project Members
    // ----------------------------------------------------
    console.log('[Test 9] Add / Remove Project Members...');
    // Assigned manager (secondPm) adds Designer
    const addProjMemberRes = await testRequest('POST', `/api/projects/${newProjectId}/members`, {
      user_id: designUser.id,
      role_in_project: 'DESIGNER'
    }, secondPmToken);
    assert.strictEqual(addProjMemberRes.status, 201);
    assert.strictEqual(addProjMemberRes.body.data.role_in_project, 'DESIGNER');

    // Check members
    const getProjMembersRes = await testRequest('GET', `/api/projects/${newProjectId}/members`, undefined, secondPmToken);
    assert.strictEqual(getProjMembersRes.status, 200);
    assert.ok(getProjMembersRes.body.data.some((m: any) => m.user_id === designUser.id));

    // Remove member
    const removeProjMemberRes = await testRequest('DELETE', `/api/projects/${newProjectId}/members/${designUser.id}`, undefined, secondPmToken);
    assert.strictEqual(removeProjMemberRes.status, 200);
    console.log('  ✓ Project member added and removed by manager');

    // ----------------------------------------------------
    // Test 10: Project Authorization
    // ----------------------------------------------------
    console.log('[Test 10] Project Authorization Check...');
    // DevUser was added in initial member_ids -> should access project
    const devAccessRes = await testRequest('GET', `/api/projects/${newProjectId}`, undefined, devToken);
    assert.strictEqual(devAccessRes.status, 200, 'Assigned developer must access project');

    // Unassigned user (DesignUser after being removed) -> should be forbidden if not in team
    // Create an outsider user with no teams or projects
    const outsiderSignup = await testRequest('POST', '/api/auth/signup', {
      name: 'External Contractor',
      email: `contractor_${timestamp}@upsow.com`,
      password: 'SecurePassword123!',
      role: 'TEAM_MEMBER'
    });
    const outsiderToken = outsiderSignup.body.data.token;

    const outsiderAccessRes = await testRequest('GET', `/api/projects/${newProjectId}`, undefined, outsiderToken);
    assert.strictEqual(outsiderAccessRes.status, 403, 'Outsider must be forbidden from accessing project');
    assert.strictEqual(outsiderAccessRes.body.error.code, 'FORBIDDEN');
    console.log('  ✓ Project authorization strictly enforced (200 OK vs 403 FORBIDDEN)');

    // ----------------------------------------------------
    // Test 11: Team Authorization
    // ----------------------------------------------------
    console.log('[Test 11] Team Authorization Check...');
    const teamGetRes = await testRequest('GET', `/api/teams/${newTeamId}`, undefined, devToken);
    assert.strictEqual(teamGetRes.status, 200);
    console.log('  ✓ Team details accessible to team members');

    // ----------------------------------------------------
    // Test 12: Project Progress Calculation
    // ----------------------------------------------------
    console.log('[Test 12] Project Progress Calculation...');
    // Seed 4 tasks in newProjectId: 2 COMPLETED, 1 IN_PROGRESS, 1 TODO -> 50%
    db.prepare(`
      INSERT INTO tasks (title, project_id, creator_id, status)
      VALUES 
        ('Task A', ?, ?, 'COMPLETED'),
        ('Task B', ?, ?, 'COMPLETED'),
        ('Task C', ?, ?, 'IN_PROGRESS'),
        ('Task D', ?, ?, 'TODO')
    `).run(newProjectId, devUser.id, newProjectId, devUser.id, newProjectId, devUser.id, newProjectId, devUser.id);

    const progressRes = await testRequest('GET', `/api/projects/${newProjectId}/progress`, undefined, adminToken);
    assert.strictEqual(progressRes.status, 200);
    assert.strictEqual(progressRes.body.data.total_tasks, 4);
    assert.strictEqual(progressRes.body.data.completed_tasks, 2);
    assert.strictEqual(progressRes.body.data.in_progress_tasks, 1);
    assert.strictEqual(progressRes.body.data.progress_percentage, 50);

    const projectDetailRes = await testRequest('GET', `/api/projects/${newProjectId}`, undefined, adminToken);
    assert.strictEqual(projectDetailRes.body.data.progress.progress_percentage, 50);
    console.log('  ✓ Progress calculation dynamically accurate (4 tasks, 2 completed = 50%)');

    // ----------------------------------------------------
    // Test 13: Unauthorized Access Rejection
    // ----------------------------------------------------
    console.log('[Test 13] Unauthorized Access Rejection...');
    // Team member attempts to create project -> 403
    const memberCreateProjectRes = await testRequest('POST', '/api/projects', {
      name: `Member Illegal Project ${timestamp}`
    }, devToken);
    assert.strictEqual(memberCreateProjectRes.status, 403);
    assert.strictEqual(memberCreateProjectRes.body.error.code, 'FORBIDDEN');

    // Team member attempts to delete project -> 403
    const memberDeleteProjectRes = await testRequest('DELETE', `/api/projects/${newProjectId}`, undefined, devToken);
    assert.strictEqual(memberDeleteProjectRes.status, 403);
    assert.strictEqual(memberDeleteProjectRes.body.error.code, 'FORBIDDEN');
    console.log('  ✓ Team Member forbidden from creating and deleting projects');

    // ----------------------------------------------------
    // Test 14: Admin Permissions
    // ----------------------------------------------------
    console.log('[Test 14] Admin Global Permissions Check...');
    // Admin lists all projects
    const adminProjectsRes = await testRequest('GET', '/api/projects', undefined, adminToken);
    assert.strictEqual(adminProjectsRes.status, 200);
    assert.ok(adminProjectsRes.body.data.length >= 2, 'Admin must see all projects in database');

    // Admin lists all teams
    const adminTeamsRes = await testRequest('GET', '/api/teams', undefined, adminToken);
    assert.strictEqual(adminTeamsRes.status, 200);
    assert.ok(adminTeamsRes.body.data.length >= 3, 'Admin must see all teams');
    console.log('  ✓ Admin possesses global visibility and management access');

    // ----------------------------------------------------
    // Test 15: Project Manager Permissions
    // ----------------------------------------------------
    console.log('[Test 15] Project Manager Specific Permissions Check...');
    // pmUser (original PM) tries to modify secondPm's project -> 403 Forbidden
    const unauthPmUpdateRes = await testRequest('PUT', `/api/projects/${newProjectId}`, {
      name: 'Hijacked Project Name'
    }, pmToken);
    assert.strictEqual(unauthPmUpdateRes.status, 403, 'PM cannot modify another PM project without assignment');
    console.log('  ✓ PM cannot modify another PM project unless assigned as manager');

    // ----------------------------------------------------
    // Test 16: Team Member Permissions
    // ----------------------------------------------------
    console.log('[Test 16] Team Member Permissions Check...');
    // Developer can access project members for their project
    const devProjMembers = await testRequest('GET', `/api/projects/${newProjectId}/members`, undefined, devToken);
    assert.strictEqual(devProjMembers.status, 200);
    assert.ok(Array.isArray(devProjMembers.body.data));
    console.log('  ✓ Team member can access their assigned project members list');

    // ----------------------------------------------------
    // Test 17: Transaction Rollback for Failed Multi-step Mutations
    // ----------------------------------------------------
    console.log('[Test 17] Transaction Rollback for Failed Multi-step Mutations...');
    const projectCountBefore = (db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count;

    try {
      // Simulate multi-step project creation with non-existent member in member_ids
      ProjectService.createProject({
        name: `Rollback Project ${timestamp}`,
        member_ids: [999999] // Non-existent user triggers exception inside transaction
      }, adminUser);
      assert.fail('Should have thrown an error');
    } catch (err: any) {
      // Expected transaction failure
    }

    const projectCountAfter = (db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count;
    assert.strictEqual(projectCountBefore, projectCountAfter, 'Failed multi-step mutation must roll back without inserting project row');
    console.log('  ✓ Multi-step transaction rollback tested and confirmed atomic');

    console.log('\n=== [PHASE 2] ALL 17 INTEGRATION TESTS PASSED! ===');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ [PHASE 2] TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runPhase2Tests();
