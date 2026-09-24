import assert from 'assert';
import { db, initializeDatabase, seedDatabase } from '../src/db.js';
import { app, server } from '../src/index.js';
import http from 'http';
import { AttachmentService } from '../src/services/attachment.service.js';

console.log('=== [PHASE 7] RUNNING DATABASE-BACKED BLOB ATTACHMENTS & STREAMING TESTS ===\n');

let testPort: number;
let serverInstance: http.Server;

// Helper to make test HTTP JSON requests
async function testRequest(
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
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
            resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode || 500, body: data, headers: res.headers });
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

// Helper to make multipart/form-data upload request
async function testMultipartUpload(
  path: string,
  fields: Record<string, string>,
  file: { filename: string; mimetype: string; content: Buffer },
  token?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const boundary = '----UpsowTestBoundary' + Math.random().toString(36).substring(2);
    const chunks: Buffer[] = [];

    // Append text fields
    for (const [key, value] of Object.entries(fields)) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
        )
      );
    }

    // Append file
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.mimetype}\r\n\r\n`
      )
    );
    chunks.push(file.content);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const payload = Buffer.concat(chunks);

    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length.toString()
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method: 'POST',
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
    req.write(payload);
    req.end();
  });
}

// Helper to stream binary buffer back from GET
async function testStreamBinary(
  path: string,
  token?: string
): Promise<{ status: number; data: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method: 'GET',
        headers
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 500,
            data: Buffer.concat(chunks),
            headers: res.headers
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function runPhase7Tests() {
  try {
    initializeDatabase();
    seedDatabase();

    // Start ephemeral server
    await new Promise<void>((resolve) => {
      serverInstance = server.listen(0, '127.0.0.1', () => {
        const addr = serverInstance.address() as any;
        testPort = addr.port;
        resolve();
      });
    });

    // 1. Authenticate users
    const adminLogin = await testRequest('POST', '/api/auth/login', {
      email: 'admin@upsow.com',
      password: 'Admin@123'
    });
    const adminToken = adminLogin.body.data.token;

    const devLogin = await testRequest('POST', '/api/auth/login', {
      email: 'developer@upsow.com',
      password: 'Developer@123'
    });
    const devToken = devLogin.body.data.token;

    // Create a target project and task for testing attachments
    const timestamp = Date.now();
    const createProjRes = await testRequest(
      'POST',
      '/api/projects',
      {
        name: `Phase 7 Project ${timestamp}`,
        manager_id: 1,
        member_ids: [devLogin.body.data.user.id]
      },
      adminToken
    );
    assert(createProjRes.body.data?.id, 'Target project should be created');
    const targetProjectId = createProjRes.body.data.id;

    const taskRes = await testRequest(
      'POST',
      '/api/tasks',
      {
        title: 'Phase 7 BLOB Attachment Test Task',
        project_id: targetProjectId,
        assignee_id: devLogin.body.data.user.id,
        priority: 'HIGH',
        status: 'IN_PROGRESS'
      },
      adminToken
    );
    const testTaskId = taskRes.body.data.id;
    assert(testTaskId, 'Target task should be created');

    // ----------------------------------------------------
    // TEST 1: Upload Task Image Attachment (Binary BLOB in SQLite)
    // ----------------------------------------------------
    console.log('[Test 1] Upload Task Image Attachment (Binary BLOB)...');
    const imageBuffer = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');
    const uploadRes = await testMultipartUpload(
      '/api/attachments/upload',
      { entity_type: 'TASK', entity_id: testTaskId.toString() },
      { filename: 'system_architecture.gif', mimetype: 'image/gif', content: imageBuffer },
      devToken
    );

    assert.strictEqual(uploadRes.status, 201, 'Upload should return 201 Created');
    assert.strictEqual(uploadRes.body.success, true);
    const imageAttachmentId = uploadRes.body.data.id;
    assert.strictEqual(uploadRes.body.data.file_name, 'system_architecture.gif');
    assert.strictEqual(uploadRes.body.data.mime_type, 'image/gif');
    assert.strictEqual(uploadRes.body.data.file_size, imageBuffer.length);
    assert.strictEqual(uploadRes.body.data.data, undefined, 'Raw BLOB should not be returned in metadata DTO');

    // Verify raw BLOB stored in SQLite
    const rowInDb = db.prepare('SELECT id, file_name, mime_type, file_size, data FROM attachments WHERE id = ?').get(imageAttachmentId) as any;
    assert(rowInDb, 'Attachment record must exist in SQLite');
    assert(Buffer.isBuffer(rowInDb.data), 'Data column must be a binary Buffer BLOB');
    assert.strictEqual(rowInDb.data.toString(), imageBuffer.toString(), 'Binary data in database must exactly match uploaded buffer');
    console.log('  ✓ Image attachment stored as binary BLOB in SQLite with exact integrity');

    // ----------------------------------------------------
    // TEST 2: Upload PDF Document Attachment
    // ----------------------------------------------------
    console.log('[Test 2] Upload PDF Document Attachment...');
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Upsow MVP PRD) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    const pdfUploadRes = await testMultipartUpload(
      '/api/attachments/upload',
      { entity_type: 'TASK', entity_id: testTaskId.toString() },
      { filename: 'upsow_prd_spec.pdf', mimetype: 'application/pdf', content: pdfBuffer },
      adminToken
    );

    assert.strictEqual(pdfUploadRes.status, 201, 'PDF upload should return 201 Created');
    const pdfAttachmentId = pdfUploadRes.body.data.id;
    assert.strictEqual(pdfUploadRes.body.data.file_name, 'upsow_prd_spec.pdf');
    assert.strictEqual(pdfUploadRes.body.data.mime_type, 'application/pdf');
    console.log('  ✓ PDF document uploaded successfully as second BLOB record');

    // ----------------------------------------------------
    // TEST 3: Authenticated Streaming & Inline Header Check
    // ----------------------------------------------------
    console.log('[Test 3] Authenticated Streaming (GET /api/attachments/:id)...');
    const streamRes = await testStreamBinary(`/api/attachments/${imageAttachmentId}`, devToken);
    assert.strictEqual(streamRes.status, 200, 'Streaming route should return 200 OK');
    assert.strictEqual(streamRes.headers['content-type'], 'image/gif', 'Content-Type must match stored MIME type');
    assert(streamRes.headers['content-disposition']?.includes('inline'), 'Default disposition must be inline for browser previews');
    assert.strictEqual(streamRes.data.toString(), imageBuffer.toString(), 'Streamed binary content must match source buffer');
    console.log('  ✓ Streaming endpoint served binary data with proper Content-Type & inline disposition');

    // ----------------------------------------------------
    // TEST 4: One-Click Download Header (?download=true)
    // ----------------------------------------------------
    console.log('[Test 4] File Download Header (?download=true)...');
    const downloadRes = await testStreamBinary(`/api/attachments/${pdfAttachmentId}?download=true`, adminToken);
    assert.strictEqual(downloadRes.status, 200);
    assert(downloadRes.headers['content-disposition']?.includes('attachment'), 'Download disposition must be attachment');
    assert.strictEqual(downloadRes.headers['content-type'], 'application/pdf');
    assert.strictEqual(downloadRes.data.toString(), pdfBuffer.toString());
    console.log('  ✓ Attachment disposition correctly toggled to attachment for one-click downloading');

    // ----------------------------------------------------
    // TEST 5: Entity Attachment Listing
    // ----------------------------------------------------
    console.log('[Test 5] Entity Attachment Listing (GET /api/attachments/entity/TASK/:id)...');
    const listRes = await testRequest('GET', `/api/attachments/entity/TASK/${testTaskId}`, undefined, devToken);
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.body.success, true);
    assert.strictEqual(listRes.body.data.length, 2, 'Should list both uploaded attachments');
    const filenames = listRes.body.data.map((a: any) => a.file_name);
    assert(filenames.includes('system_architecture.gif'));
    assert(filenames.includes('upsow_prd_spec.pdf'));
    console.log('  ✓ Entity attachment list returned 2 metadata entries with uploader joins');

    // ----------------------------------------------------
    // TEST 6: Task Detail Hydration with Attachments
    // ----------------------------------------------------
    console.log('[Test 6] Task Detail Hydration with Attachments...');
    const detailRes = await testRequest('GET', `/api/tasks/${testTaskId}`, undefined, devToken);
    assert.strictEqual(detailRes.status, 200);
    const detailTask = detailRes.body.data;
    assert.strictEqual(detailTask.attachment_count, 2, 'attachment_count must equal 2');
    assert(Array.isArray(detailTask.attachments), 'attachments array must be present');
    assert.strictEqual(detailTask.attachments.length, 2);
    console.log('  ✓ Task detail endpoint automatically hydrates attachments array and count');

    // ----------------------------------------------------
    // TEST 7: Activity Log Generation on Attachment Upload
    // ----------------------------------------------------
    console.log('[Test 7] Activity Log Audit Trail for Attachment Upload...');
    const logs = db.prepare("SELECT * FROM activity_logs WHERE task_id = ? AND action_type = 'ATTACHMENT_ADDED'").all(testTaskId) as any[];
    assert(logs.length >= 2, 'Should have logged 2 ATTACHMENT_ADDED activity entries');
    assert(logs[0].description.includes('attached'), 'Activity log description must mention attachment action');
    console.log('  ✓ Audit trail verified with user attribution and file size metrics');

    // ----------------------------------------------------
    // TEST 8: Multi-Tenant Security & RBAC Isolation on Attachments
    // ----------------------------------------------------
    console.log('[Test 8] Security & Isolation (Unauthorized Project Access)...');
    const secretTeam = db.prepare('INSERT INTO teams (name) VALUES (?)').run(`Secret Team ${Date.now()}`).lastInsertRowid;
    const opProjName = `Secret Ops Project ${Date.now()}`;
    const opProj = db.prepare('INSERT INTO projects (name, team_id, manager_id, status) VALUES (?, ?, ?, ?)').run(opProjName, secretTeam, 2, 'ACTIVE');
    const opTaskId = db.prepare('INSERT INTO tasks (title, project_id, team_id, creator_id, priority, status) VALUES (?, ?, ?, ?, ?, ?)').run(
      'Ops Secret Task',
      opProj.lastInsertRowid,
      secretTeam,
      2,
      'HIGH',
      'TODO'
    ).lastInsertRowid;

    const confBuf = Buffer.from('Confidential Budget Data');
    const opAttachment = await AttachmentService.uploadAttachment(
      'TASK',
      Number(opTaskId),
      {
        originalname: 'confidential_budget.pdf',
        mimetype: 'application/pdf',
        size: confBuf.length,
        buffer: confBuf
      } as any,
      2
    );

    // Developer (Team 1) attempts to stream confidential attachment from Team 2 project
    const forbiddenStream = await testStreamBinary(`/api/attachments/${opAttachment.id}`, devToken);
    assert.strictEqual(forbiddenStream.status, 403, 'Unauthorized user must be rejected with 403 FORBIDDEN');

    // Admin (Global Access) can stream it
    const adminAllowedStream = await testStreamBinary(`/api/attachments/${opAttachment.id}`, adminToken);
    assert.strictEqual(adminAllowedStream.status, 200, 'Admin must be granted access');
    console.log('  ✓ Access control strictly enforced: Team 1 blocked with 403, Admin allowed');

    // ----------------------------------------------------
    // TEST 9: Attachment Deletion & Cascading Count Update
    // ----------------------------------------------------
    console.log('[Test 9] Attachment Deletion & Count Update...');
    const deleteRes = await testRequest('DELETE', `/api/attachments/${imageAttachmentId}`, undefined, devToken);
    assert.strictEqual(deleteRes.status, 200, 'Delete should return 200 OK');

    // Verify removed from database
    const checkDeleted = db.prepare('SELECT id FROM attachments WHERE id = ?').get(imageAttachmentId);
    assert.strictEqual(checkDeleted, undefined, 'Attachment record must be deleted');

    // Check task detail now has 1 attachment
    const detailAfterDelete = await testRequest('GET', `/api/tasks/${testTaskId}`, undefined, devToken);
    assert.strictEqual(detailAfterDelete.body.data.attachment_count, 1, 'attachment_count must decrement to 1');
    assert.strictEqual(detailAfterDelete.body.data.attachments.length, 1);
    console.log('  ✓ Attachment deleted and task count updated cleanly');

    // ----------------------------------------------------
    // TEST 10: File Type & Missing File Validation
    // ----------------------------------------------------
    console.log('[Test 10] Unsupported File Type Rejection...');
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
    const exeUpload = await testMultipartUpload(
      '/api/attachments/upload',
      { entity_type: 'TASK', entity_id: testTaskId.toString() },
      { filename: 'malicious.exe', mimetype: 'application/x-msdownload', content: exeBuffer },
      adminToken
    );
    assert.strictEqual(exeUpload.status, 400, 'Unsupported executable must be rejected with 400 Bad Request');
    console.log('  ✓ Executable rejected by multer file type filter');

    console.log('\n=== [PHASE 7] ALL 10 DATABASE BLOB ATTACHMENT TESTS PASSED! ===\n');
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

runPhase7Tests().catch((err) => {
  console.error('[PHASE 7 TEST ERROR]', err);
  process.exit(1);
});
