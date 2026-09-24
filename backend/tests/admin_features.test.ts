import assert from 'assert';
import http from 'http';
import { db, resetDatabase } from '../src/db.js';
import { app } from '../src/index.js';

console.log('=== RUNNING ADMIN USER MANAGEMENT, SEED & PROJECT VISIBILITY VERIFICATION ===\n');

// Clean DB with exactly 3 accounts
resetDatabase();

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
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          res.on('end', () => {
            server.close();
            try {
              const parsed = JSON.parse(responseData);
              resolve({ status: res.statusCode || 500, body: parsed });
            } catch {
              resolve({ status: res.statusCode || 500, body: responseData });
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
    // Test 1: Verify Seed Accounts & Zero Mock Data
    console.log('[Test 1] Verifying Seeded Accounts & Mock Data Removal...');
    const users = db.prepare('SELECT id, name, email, role FROM users').all() as any[];
    assert.strictEqual(users.length, 3, 'Must have exactly 3 seeded users');
    assert.ok(users.some(u => u.email === 'admin@upsow.com' && u.role === 'ADMIN'), 'Admin must exist');
    assert.ok(users.some(u => u.email === 'pm@upsow.com' && u.role === 'PROJECT_MANAGER'), 'PM must exist');
    assert.ok(users.some(u => u.email === 'developer@upsow.com' && u.role === 'TEAM_MEMBER'), 'Developer must exist');

    const projectCount = (db.prepare('SELECT count(*) as c FROM projects').get() as any).c;
    const teamCount = (db.prepare('SELECT count(*) as c FROM teams').get() as any).c;
    const taskCount = (db.prepare('SELECT count(*) as c FROM tasks').get() as any).c;
    assert.strictEqual(projectCount, 0, 'No mock projects should exist');
    assert.strictEqual(teamCount, 0, 'No mock teams should exist');
    assert.strictEqual(taskCount, 0, 'No mock tasks should exist');
    console.log('  ✓ Exactly 3 users seeded and zero mock data verified');

    // Test 2: Authenticate Admin & Developer
    console.log('\n[Test 2] Authenticating Admin & Developer...');
    const adminLogin = await testRequest('POST', '/api/auth/login', {
      email: 'admin@upsow.com',
      password: 'Admin@123'
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.body.data.token;

    const devLogin = await testRequest('POST', '/api/auth/login', {
      email: 'developer@upsow.com',
      password: 'Developer@123'
    });
    assert.strictEqual(devLogin.status, 200);
    const devToken = devLogin.body.data.token;
    console.log('  ✓ Admin and Developer tokens obtained');

    // Test 3: Admin Promotes Developer to PROJECT_MANAGER
    console.log('\n[Test 3] Admin Promotes Team Member to PROJECT_MANAGER...');
    const promoteRes = await testRequest(
      'PATCH',
      '/api/auth/users/3/role',
      { role: 'PROJECT_MANAGER' },
      adminToken
    );
    assert.strictEqual(promoteRes.status, 200);
    assert.strictEqual(promoteRes.body.data.role, 'PROJECT_MANAGER');

    const dbDevRole = (db.prepare('SELECT role FROM users WHERE id = 3').get() as any).role;
    assert.strictEqual(dbDevRole, 'PROJECT_MANAGER', 'Database must reflect updated role');
    console.log('  ✓ User promoted successfully in API and DB');

    // Test 4: Admin Demotes User 3 back to TEAM_MEMBER
    console.log('\n[Test 4] Admin Demotes User 3 back to TEAM_MEMBER...');
    const demoteRes = await testRequest(
      'PATCH',
      '/api/auth/users/3/role',
      { role: 'TEAM_MEMBER' },
      adminToken
    );
    assert.strictEqual(demoteRes.status, 200);
    assert.strictEqual(demoteRes.body.data.role, 'TEAM_MEMBER');
    console.log('  ✓ User demoted back to TEAM_MEMBER');

    // Test 5: RBAC Enforcement - Non-admin Cannot Change Roles
    console.log('\n[Test 5] Non-admin cannot promote users (403 Forbidden)...');
    const unauthorizedRes = await testRequest(
      'PATCH',
      '/api/auth/users/3/role',
      { role: 'PROJECT_MANAGER' },
      devToken
    );
    assert.strictEqual(unauthorizedRes.status, 403);
    console.log('  ✓ RBAC strictly blocked non-admin role mutation (403 Forbidden)');

    // Test 6: Admin Provisions New Project Manager Account
    console.log('\n[Test 6] Admin Provisions New User via POST /api/auth/users...');
    const createRes = await testRequest(
      'POST',
      '/api/auth/users',
      {
        name: 'Sarah Connor',
        email: 'sarah@upsow.com',
        password: 'Password123',
        role: 'PROJECT_MANAGER'
      },
      adminToken
    );
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.body.data.email, 'sarah@upsow.com');
    assert.strictEqual(createRes.body.data.role, 'PROJECT_MANAGER');
    assert.ok(!createRes.body.data.token, 'Must not return token or override admin session');
    console.log('  ✓ New account provisioned by Admin successfully');

    // Test 7: Project Creation & Project Visibility Isolation
    console.log('\n[Test 7] Project Visibility Isolation (Team Member vs Manager)...');
    const projectCreateRes = await testRequest(
      'POST',
      '/api/projects',
      {
        name: 'Project Apollo',
        description: 'Classified Mission',
        manager_id: 2 // PM is manager
      },
      adminToken
    );
    assert.strictEqual(projectCreateRes.status, 201);
    const projectId = projectCreateRes.body.data.id;

    // Developer (user 3) is NOT assigned to Project Apollo -> should NOT see it
    const devProjectsRes = await testRequest('GET', '/api/projects', undefined, devToken);
    assert.strictEqual(devProjectsRes.status, 200);
    const devProjects = devProjectsRes.body.data;
    assert.ok(
      !devProjects.some((p: any) => p.id === projectId),
      'Project Apollo must NOT appear in unassigned Developer projects list'
    );
    console.log('  ✓ Project Apollo is invisible to unassigned Team Member');

    // Test 8: Add Member to Project -> Project becomes visible
    console.log('\n[Test 8] Add Member to Project (POST /api/projects/:id/members)...');
    const addMemberRes = await testRequest(
      'POST',
      `/api/projects/${projectId}/members`,
      { user_id: 3, role_in_project: 'MEMBER' },
      adminToken
    );
    assert.strictEqual(addMemberRes.status, 201);

    // Developer (user 3) is NOW assigned -> should see Project Apollo
    const devProjectsAfterAdd = await testRequest('GET', '/api/projects', undefined, devToken);
    assert.ok(
      devProjectsAfterAdd.body.data.some((p: any) => p.id === projectId),
      'Project Apollo must NOW be visible to Developer'
    );
    console.log('  ✓ Developer gained access to Project Apollo after being added as member');

    // Test 9: Remove Member from Project -> Project disappears again
    console.log('\n[Test 9] Remove Member from Project (DELETE /api/projects/:id/members/:userId)...');
    const removeMemberRes = await testRequest(
      'DELETE',
      `/api/projects/${projectId}/members/3`,
      undefined,
      adminToken
    );
    assert.strictEqual(removeMemberRes.status, 200);

    // Developer (user 3) should NO LONGER see Project Apollo
    const devProjectsAfterRemove = await testRequest('GET', '/api/projects', undefined, devToken);
    assert.ok(
      !devProjectsAfterRemove.body.data.some((p: any) => p.id === projectId),
      'Project Apollo must NO LONGER be visible to removed Developer'
    );
    console.log('  ✓ Project Apollo became invisible again after Developer was removed');

    // Clean up database back to 3 accounts
    resetDatabase();
    console.log('\n=== ALL ADMIN, ROLE PROMOTION, SEEDING & VISIBILITY TESTS PASSED ===\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

runTests();
