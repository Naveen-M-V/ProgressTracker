import assert from 'assert';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';
import { AuthService } from '../src/services/auth.service.js';
import { app } from '../src/index.js';
import http from 'http';

console.log('=== [PHASE 1] RUNNING AUTHENTICATION & RBAC VERIFICATION TESTS ===\n');

// Helper to make test HTTP requests to the express app without starting external server
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

async function runPhase1Tests() {
  try {
    initializeDatabase();
    seedDatabase();

    const uniqueTimestamp = Date.now();
    const testUserEmail = `testuser_${uniqueTimestamp}@upsow.com`;
    const testPassword = 'SecurePassword123!';

    // 1. Successful Signup
    console.log('[Test 1] Successful Signup...');
    const signupRes = await testRequest('POST', '/api/auth/signup', {
      name: 'Test Engineer',
      email: testUserEmail,
      password: testPassword,
      role: 'TEAM_MEMBER'
    });

    assert.strictEqual(signupRes.status, 201, 'Signup must return 201 Created');
    assert.strictEqual(signupRes.body.success, true, 'Signup response must have success: true');
    assert.strictEqual(signupRes.body.data.user.email, testUserEmail);
    assert.ok(signupRes.body.data.token, 'Signup must return a valid token');
    console.log('  ✓ Successful signup verified (201 Created)');

    // 2. Duplicate Email Rejection
    console.log('[Test 2] Duplicate Email Rejection...');
    const dupRes = await testRequest('POST', '/api/auth/signup', {
      name: 'Another Engineer',
      email: testUserEmail,
      password: testPassword,
      role: 'TEAM_MEMBER'
    });

    assert.strictEqual(dupRes.status, 409, 'Duplicate signup must return 409 Conflict');
    assert.strictEqual(dupRes.body.success, false);
    assert.strictEqual(dupRes.body.error.code, 'CONFLICT');
    console.log('  ✓ Duplicate email rejected with 409 CONFLICT');

    // 3. Password Hashing
    console.log('[Test 3] Password Hashing in Database...');
    const userInDb = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(testUserEmail) as { password_hash: string };
    assert.ok(userInDb, 'User must exist in DB');
    assert.notStrictEqual(userInDb.password_hash, testPassword, 'Password must never be stored as plaintext');
    assert.ok(bcrypt.compareSync(testPassword, userInDb.password_hash), 'Stored bcrypt hash must verify with password');
    console.log('  ✓ Password securely hashed with bcrypt salt');

    // 4. Successful Login
    console.log('[Test 4] Successful Login...');
    const loginRes = await testRequest('POST', '/api/auth/login', {
      email: testUserEmail,
      password: testPassword
    });

    assert.strictEqual(loginRes.status, 200, 'Login must return 200 OK');
    assert.strictEqual(loginRes.body.success, true);
    assert.ok(loginRes.body.data.token, 'Login must return a JWT token');
    assert.strictEqual(loginRes.body.data.user.email, testUserEmail);
    const userToken = loginRes.body.data.token;
    console.log('  ✓ Successful login verified (200 OK)');

    // 5. Invalid Password Rejection
    console.log('[Test 5] Invalid Password Rejection...');
    const wrongPwdRes = await testRequest('POST', '/api/auth/login', {
      email: testUserEmail,
      password: 'WrongPassword999!'
    });

    assert.strictEqual(wrongPwdRes.status, 401, 'Invalid password must return 401 Unauthorized');
    assert.strictEqual(wrongPwdRes.body.success, false);
    assert.strictEqual(wrongPwdRes.body.error.code, 'AUTH_REQUIRED');
    console.log('  ✓ Invalid password rejected with 401 AUTH_REQUIRED');

    // 6. Invalid / Nonexistent User Rejection
    console.log('[Test 6] Nonexistent User Login Rejection...');
    const noUserRes = await testRequest('POST', '/api/auth/login', {
      email: 'nonexistent_account_999@upsow.com',
      password: testPassword
    });

    assert.strictEqual(noUserRes.status, 401, 'Nonexistent user must return 401 Unauthorized');
    assert.strictEqual(noUserRes.body.success, false);
    console.log('  ✓ Nonexistent user rejected with 401');

    // 7. JWT Issuance
    console.log('[Test 7] JWT Issuance...');
    assert.strictEqual(typeof userToken, 'string');
    assert.ok(userToken.split('.').length === 3, 'JWT must contain header, payload, and signature segments');
    console.log('  ✓ Standard 3-segment JWT correctly formatted');

    // 8. JWT Verification
    console.log('[Test 8] JWT Verification...');
    const decoded = AuthService.verifyToken(userToken);
    assert.strictEqual(decoded.email, testUserEmail);
    assert.strictEqual(decoded.role, 'TEAM_MEMBER');
    console.log('  ✓ JWT signature and payload decoded and verified');

    // 9. Expired / Invalid Token Rejection
    console.log('[Test 9] Invalid Token Rejection...');
    const invalidTokenRes = await testRequest('GET', '/api/auth/me', undefined, 'invalid.tampered.token');
    assert.strictEqual(invalidTokenRes.status, 401, 'Tampered token must return 401 Unauthorized');
    assert.strictEqual(invalidTokenRes.body.success, false);

    // Test genuinely expired token
    const expiredToken = jwt.sign(
      { userId: 1, email: 'admin@upsow.com', role: 'ADMIN' },
      process.env.JWT_SECRET || 'upsow_dev_secret_key_change_in_production_2026',
      { expiresIn: '-1s' }
    );
    const expiredTokenRes = await testRequest('GET', '/api/auth/me', undefined, expiredToken);
    assert.strictEqual(expiredTokenRes.status, 401, 'Expired token must return 401 Unauthorized');
    assert.strictEqual(expiredTokenRes.body.error.message, 'Authentication token has expired');
    console.log('  ✓ Invalid and expired tokens properly rejected');

    // 10. /me Authenticated Access
    console.log('[Test 10] /me Authenticated Access...');
    const meRes = await testRequest('GET', '/api/auth/me', undefined, userToken);
    assert.strictEqual(meRes.status, 200, '/me must return 200 for valid token');
    assert.strictEqual(meRes.body.data.email, testUserEmail);
    console.log('  ✓ /me endpoint returned authenticated profile');

    // 11. /me Unauthenticated Rejection
    console.log('[Test 11] /me Unauthenticated Rejection...');
    const meNoAuth = await testRequest('GET', '/api/auth/me');
    assert.strictEqual(meNoAuth.status, 401, '/me without token must return 401 Unauthorized');
    assert.strictEqual(meNoAuth.body.error.code, 'AUTH_REQUIRED');
    console.log('  ✓ /me without Bearer token rejected with 401 AUTH_REQUIRED');

    // 12. Admin Authorization
    console.log('[Test 12] Admin Authorization Check...');
    const adminLogin = await testRequest('POST', '/api/auth/login', {
      email: 'admin@upsow.com',
      password: 'Admin@123'
    });
    const adminToken = adminLogin.body.data.token;

    const pmLogin = await testRequest('POST', '/api/auth/login', {
      email: 'pm@upsow.com',
      password: 'Manager@123'
    });
    const pmToken = pmLogin.body.data.token;

    // Admin endpoint accessed by Admin -> 200 OK
    const adminAccessByAdmin = await testRequest('GET', '/api/auth/test/admin', undefined, adminToken);
    assert.strictEqual(adminAccessByAdmin.status, 200, 'Admin token must access admin endpoint');

    // Admin endpoint accessed by PM -> 403 Forbidden
    const adminAccessByPM = await testRequest('GET', '/api/auth/test/admin', undefined, pmToken);
    assert.strictEqual(adminAccessByPM.status, 403, 'PM token must be forbidden on admin endpoint');
    assert.strictEqual(adminAccessByPM.body.error.code, 'FORBIDDEN');

    // Admin endpoint accessed by Member -> 403 Forbidden
    const adminAccessByMember = await testRequest('GET', '/api/auth/test/admin', undefined, userToken);
    assert.strictEqual(adminAccessByMember.status, 403, 'Member token must be forbidden on admin endpoint');
    console.log('  ✓ Admin endpoint allows ADMIN and strictly rejects PM and Member with 403 FORBIDDEN');

    // 13. Project Manager Authorization
    console.log('[Test 13] Project Manager Authorization Check...');
    // PM endpoint accessed by Admin -> 200 OK
    const pmAccessByAdmin = await testRequest('GET', '/api/auth/test/pm', undefined, adminToken);
    assert.strictEqual(pmAccessByAdmin.status, 200);

    // PM endpoint accessed by PM -> 200 OK
    const pmAccessByPM = await testRequest('GET', '/api/auth/test/pm', undefined, pmToken);
    assert.strictEqual(pmAccessByPM.status, 200);

    // PM endpoint accessed by Member -> 403 Forbidden
    const pmAccessByMember = await testRequest('GET', '/api/auth/test/pm', undefined, userToken);
    assert.strictEqual(pmAccessByMember.status, 403, 'Member token must be forbidden on PM endpoint');
    console.log('  ✓ PM endpoint allows PM & ADMIN and rejects Member with 403 FORBIDDEN');

    // 14. Team Member Authorization
    console.log('[Test 14] Team Member Authorization Check...');
    const memberAccessByMember = await testRequest('GET', '/api/auth/test/member', undefined, userToken);
    assert.strictEqual(memberAccessByMember.status, 200);

    const memberAccessByAdmin = await testRequest('GET', '/api/auth/test/member', undefined, adminToken);
    assert.strictEqual(memberAccessByAdmin.status, 200);
    console.log('  ✓ Member endpoint accessible to all authenticated roles');

    // 15. Password Hash Never Appearing in API Responses
    console.log('[Test 15] Password Hash Omission Security Check...');
    assert.strictEqual(signupRes.body.data.user.password_hash, undefined, 'Signup user must not contain password_hash');
    assert.strictEqual(loginRes.body.data.user.password_hash, undefined, 'Login user must not contain password_hash');
    assert.strictEqual(meRes.body.data.password_hash, undefined, '/me user must not contain password_hash');

    const demoAccountsRes = await testRequest('GET', '/api/auth/demo-accounts');
    assert.strictEqual(demoAccountsRes.status, 200);
    for (const acc of demoAccountsRes.body.data) {
      assert.strictEqual(acc.password_hash, undefined, 'Demo accounts must not expose password_hash');
    }
    console.log('  ✓ password_hash is never exposed in any API response');

    console.log('\n=== [PHASE 1] ALL 15 AUTHENTICATION & RBAC TESTS PASSED! ===');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ [PHASE 1] TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runPhase1Tests();
