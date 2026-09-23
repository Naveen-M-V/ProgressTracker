import { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, ArrowUpRight, Lock, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { RoleBadge } from '../components/common/RoleBadge.js';

export function DashboardShell() {
  const { user, token } = useAuth();
  const [testResult, setTestResult] = useState<{
    endpoint: string;
    status: number;
    success: boolean;
    data?: any;
    error?: any;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const testEndpoint = async (endpoint: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const json = await res.json();
      setTestResult({
        endpoint,
        status: res.status,
        success: res.ok,
        data: json.data,
        error: json.error
      });
    } catch (err: any) {
      setTestResult({
        endpoint,
        status: 500,
        success: false,
        error: { message: err.message }
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ flex: 1, padding: '36px 32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Welcome Banner */}
      <div
        className="card-glass"
        style={{
          padding: '32px',
          marginBottom: '32px',
          backgroundImage: 'radial-gradient(ellipse at 80% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span className="badge badge-completed">Authenticated Session Active</span>
              {user && <RoleBadge role={user.role} />}
            </div>
            <h2 style={{ fontSize: '1.875rem', marginBottom: '8px' }}>
              Welcome back, {user?.name}!
            </h2>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Logged in as <strong style={{ color: 'var(--text-primary)' }}>{user?.email}</strong>. Phase 1 Authentication & RBAC verified.
            </p>
          </div>

          <div
            style={{
              padding: '12px 20px',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <KeyRound size={20} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>JWT Session</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}>HMAC SHA-256 (7 Days)</div>
            </div>
          </div>
        </div>
      </div>

      {/* RBAC Live Interactive Verification Widget */}
      <div className="card-glass" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <ShieldCheck size={22} color="var(--brand-secondary)" />
          <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Live Backend RBAC Enforcement Tester</h3>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Click the test buttons below to send authenticated API requests using your active JWT token. The backend verifies your role and enforces strict 200 OK vs 403 Forbidden status codes.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
          <button
            onClick={() => testEndpoint('/api/auth/test/admin')}
            disabled={testing}
            className="btn-secondary"
            style={{ fontSize: '0.85rem', padding: '10px 16px' }}
          >
            <Lock size={14} color="#c084fc" />
            <span>Test Admin Endpoint (/api/auth/test/admin)</span>
            <ArrowUpRight size={14} />
          </button>

          <button
            onClick={() => testEndpoint('/api/auth/test/pm')}
            disabled={testing}
            className="btn-secondary"
            style={{ fontSize: '0.85rem', padding: '10px 16px' }}
          >
            <Lock size={14} color="#fbbf24" />
            <span>Test PM Endpoint (/api/auth/test/pm)</span>
            <ArrowUpRight size={14} />
          </button>

          <button
            onClick={() => testEndpoint('/api/auth/test/member')}
            disabled={testing}
            className="btn-secondary"
            style={{ fontSize: '0.85rem', padding: '10px 16px' }}
          >
            <Lock size={14} color="#60a5fa" />
            <span>Test Member Endpoint (/api/auth/test/member)</span>
            <ArrowUpRight size={14} />
          </button>
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {testResult.success ? (
                  <CheckCircle2 size={18} color="#10b981" />
                ) : (
                  <XCircle size={18} color="#ef4444" />
                )}
                <strong style={{ color: testResult.success ? '#34d399' : '#f87171', fontSize: '0.9rem' }}>
                  {testResult.success ? 'Access Granted' : 'Access Denied (RBAC Enforced)'}
                </strong>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: testResult.success ? '#6ee7b7' : '#fca5a5',
                  }}
                >
                  HTTP {testResult.status}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{testResult.endpoint}</span>
            </div>

            <pre
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                overflowX: 'auto',
                margin: 0,
              }}
            >
              {JSON.stringify(testResult.data || testResult.error, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Role Capabilities Reference Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <RoleBadge role="ADMIN" size="sm" />
            <h4 style={{ margin: 0, fontSize: '1rem' }}>Admin Capabilities</h4>
          </div>
          <ul style={{ paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Manage users, roles and system permissions</li>
            <li>Create and configure projects and teams</li>
            <li>Assign users across all projects & teams</li>
            <li>Full audit trail & activity history view</li>
            <li>Global search across all internal data</li>
          </ul>
        </div>

        <div className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <RoleBadge role="PROJECT_MANAGER" size="sm" />
            <h4 style={{ margin: 0, fontSize: '1rem' }}>Project Manager Capabilities</h4>
          </div>
          <ul style={{ paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Create, schedule and assign project tasks</li>
            <li>Manage Kanban boards and project calendar</li>
            <li>Track team progress percentage</li>
            <li>Add and manage project team members</li>
            <li>Direct and project channel communications</li>
          </ul>
        </div>

        <div className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <RoleBadge role="TEAM_MEMBER" size="sm" />
            <h4 style={{ margin: 0, fontSize: '1rem' }}>Team Member Capabilities</h4>
          </div>
          <ul style={{ paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Personal "My Work" dashboard (Today, Upcoming, Overdue)</li>
            <li>Update assigned task statuses & checklist items</li>
            <li>Post comments and upload attachments (DB BLOBs)</li>
            <li>Participate in project and team chat channels</li>
            <li>In-app deadline alerts and notifications</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
