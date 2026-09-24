import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Lock,
  KeyRound,
  Users,
  UserPlus,
  ArrowUpCircle,
  ArrowDownCircle,
  Shield,
  Search,
  X,
  Plus,
  Trash2,
  Layers,
  Crown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useTasks } from '../context/TaskContext.js';
import { RoleBadge } from '../components/common/RoleBadge.js';
import { UserAvatar } from '../components/common/UserAvatar.js';
import { User, UserRole } from '../types/auth.js';
import { Team } from '../types/team.js';
import { TeamMembersModal } from '../components/teams/TeamMembersModal.js';

interface DashboardShellProps {
  initialTab?: 'users' | 'teams';
}

export function DashboardShell({ initialTab = 'users' }: DashboardShellProps) {
  const { user, token } = useAuth();
  const { teams, createTeam, deleteTeam } = useTasks();

  // Active Admin Section: 'users' or 'teams'
  const [adminTab, setAdminTab] = useState<'users' | 'teams'>(initialTab);

  useEffect(() => {
    setAdminTab(initialTab);
  }, [initialTab]);

  // User Management State
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');

  // Status feedback
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create User Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('PROJECT_MANAGER');
  const [creatingUser, setCreatingUser] = useState(false);

  // Create Team Modal State
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [teamLeadId, setTeamLeadId] = useState<number | ''>('');
  const [teamMemberIds, setTeamMemberIds] = useState<number[]>([]);
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Manage Team Members Modal State
  const [selectedTeamForMembers, setSelectedTeamForMembers] = useState<Team | null>(null);

  // RBAC Tester State
  const [testResult, setTestResult] = useState<{
    endpoint: string;
    status: number;
    success: boolean;
    data?: any;
    error?: any;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  const loadUsers = async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/auth/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setUsersList(data.data);
      }
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [token]);

  const handleRoleChange = async (targetUser: User, newRole: UserRole) => {
    if (!token) return;
    setActionLoadingId(targetUser.id);
    setAlertMsg(null);

    try {
      const res = await fetch(`/api/auth/users/${targetUser.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update user role');
      }

      setAlertMsg({
        type: 'success',
        text: `Successfully updated ${targetUser.name}'s role to ${newRole.replace('_', ' ')}`
      });
      await loadUsers();
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err.message || 'Failed to update user role' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setCreatingUser(true);
    setAlertMsg(null);

    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to create user');
      }

      setAlertMsg({
        type: 'success',
        text: `Created account for ${data.data.name} as ${data.data.role.replace('_', ' ')}`
      });

      // Reset modal fields
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('PROJECT_MANAGER');
      setIsCreateModalOpen(false);

      await loadUsers();
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err.message || 'Failed to create user' });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setCreatingTeam(true);
    setAlertMsg(null);

    try {
      const newTeam = await createTeam({
        name: teamName.trim(),
        description: teamDesc.trim() || undefined,
        lead_id: teamLeadId ? Number(teamLeadId) : null,
        member_ids: teamMemberIds
      });

      if (newTeam) {
        setAlertMsg({
          type: 'success',
          text: `Team "${newTeam.name}" created successfully with ${teamMemberIds.length} members.`
        });
        setTeamName('');
        setTeamDesc('');
        setTeamLeadId('');
        setTeamMemberIds([]);
        setIsCreateTeamModalOpen(false);
      }
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err.message || 'Failed to create team' });
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId: number, name: string) => {
    if (!confirm(`Are you sure you want to delete team "${name}"? This cannot be undone.`)) {
      return;
    }

    setAlertMsg(null);
    try {
      const ok = await deleteTeam(teamId);
      if (ok) {
        setAlertMsg({ type: 'success', text: `Team "${name}" deleted.` });
      }
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err.message || 'Failed to delete team' });
    }
  };

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

  // Filtered users
  const filteredUsers = usersList.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  const totalUsers = usersList.length;
  const pmCount = usersList.filter((u) => u.role === 'PROJECT_MANAGER').length;
  const memberCount = usersList.filter((u) => u.role === 'TEAM_MEMBER').length;
  const adminCount = usersList.filter((u) => u.role === 'ADMIN').length;

  return (
    <div style={{ flex: 1, padding: '36px 32px', maxWidth: '1200px', margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      {/* Welcome Banner */}
      <div
        className="card-glass"
        style={{
          padding: '28px 32px',
          marginBottom: '28px',
          backgroundImage: 'radial-gradient(ellipse at 80% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span className="badge badge-completed">Authenticated Session Active</span>
              {user && <RoleBadge role={user.role} />}
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 6px 0', color: '#ffffff' }}>
              Admin Console & Governance
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
              Logged in as <strong style={{ color: 'var(--text-primary)' }}>{user?.email}</strong>. Manage permissions, appoint project managers, and configure company teams.
            </p>
          </div>

          <div
            style={{
              padding: '10px 16px',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <KeyRound size={18} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>JWT Session</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>HMAC SHA-256 (7 Days)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Notification Toast */}
      {alertMsg && (
        <div
          style={{
            marginBottom: '24px',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: alertMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${alertMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: alertMsg.type === 'success' ? '#34d399' : '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {alertMsg.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{alertMsg.text}</span>
          </div>
          <button
            onClick={() => setAlertMsg(null)}
            style={{ background: 'transparent', border: 'none', color: 'currentColor', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Navigation Switcher: Users vs Teams */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => setAdminTab('users')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: adminTab === 'users' ? 'var(--brand-secondary)' : 'var(--bg-tertiary)',
            color: adminTab === 'users' ? '#ffffff' : 'var(--text-secondary)',
            border: adminTab === 'users' ? '1px solid var(--brand-secondary)' : '1px solid var(--border-subtle)',
            boxShadow: adminTab === 'users' ? 'var(--shadow-glow)' : 'none'
          }}
        >
          <Users size={17} />
          <span>User & Role Management</span>
          <span style={{ fontSize: '0.75rem', padding: '1px 6px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)' }}>
            {totalUsers}
          </span>
        </button>

        <button
          onClick={() => setAdminTab('teams')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: adminTab === 'teams' ? 'var(--brand-secondary)' : 'var(--bg-tertiary)',
            color: adminTab === 'teams' ? '#ffffff' : 'var(--text-secondary)',
            border: adminTab === 'teams' ? '1px solid var(--brand-secondary)' : '1px solid var(--border-subtle)',
            boxShadow: adminTab === 'teams' ? 'var(--shadow-glow)' : 'none'
          }}
        >
          <Layers size={17} />
          <span>Team Management & Allocations</span>
          <span style={{ fontSize: '0.75rem', padding: '1px 6px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)' }}>
            {teams.length}
          </span>
        </button>
      </div>

      {/* TAB 1: USER MANAGEMENT */}
      {adminTab === 'users' && (
        <div className="card-glass" style={{ marginBottom: '32px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Users size={20} color="var(--brand-secondary)" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  System Users & Role Promotion
                </h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                Promote team members to project manager, demote roles, or provision new accounts.
              </p>
            </div>

            {isAdmin && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="btn-primary"
                style={{ padding: '9px 16px', fontSize: '0.85rem' }}
              >
                <UserPlus size={16} />
                <span>+ Create Project Manager / User</span>
              </button>
            )}
          </div>

          {/* Stats Pill Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Users</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>{totalUsers}</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.725rem', color: '#fbbf24', fontWeight: 600, textTransform: 'uppercase' }}>Project Managers</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>{pmCount}</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.725rem', color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase' }}>Team Members</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#60a5fa', marginTop: '2px' }}>{memberCount}</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.725rem', color: '#c084fc', fontWeight: 600, textTransform: 'uppercase' }}>Admins</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#c084fc', marginTop: '2px' }}>{adminCount}</div>
            </div>
          </div>

          {/* Filters & Search Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['ALL', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'ADMIN'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.775rem',
                    fontWeight: 600,
                    backgroundColor: roleFilter === r ? 'var(--brand-secondary)' : 'var(--bg-tertiary)',
                    color: roleFilter === r ? '#ffffff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer'
                  }}
                >
                  {r === 'ALL' ? 'All Roles' : r.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                minWidth: '220px'
              }}
            >
              <Search size={14} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search user by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.825rem',
                  width: '100%'
                }}
              />
            </div>
          </div>

          {/* Users Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 12px' }}>User</th>
                  <th style={{ padding: '10px 12px' }}>Current Role</th>
                  <th style={{ padding: '10px 12px' }}>Registered</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading users...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No users match the search filter.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isCurrentAdmin = u.id === user?.id;
                    const isActing = actionLoadingId === u.id;

                    return (
                      <tr
                        key={u.id}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={32} />
                            <div>
                              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {u.name} {isCurrentAdmin && <span style={{ fontSize: '0.7rem', color: 'var(--brand-secondary)' }}>(You)</span>}
                              </div>
                              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '12px' }}>
                          <RoleBadge role={u.role} size="sm" />
                        </td>

                        <td style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                        </td>

                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {isAdmin ? (
                            u.role === 'ADMIN' ? (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Shield size={13} /> Protected Admin
                              </span>
                            ) : u.role === 'TEAM_MEMBER' ? (
                              <button
                                onClick={() => handleRoleChange(u, 'PROJECT_MANAGER')}
                                disabled={isActing}
                                className="btn-secondary"
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.775rem',
                                  color: '#fbbf24',
                                  borderColor: 'rgba(245, 158, 11, 0.4)',
                                  backgroundColor: 'rgba(245, 158, 11, 0.1)'
                                }}
                              >
                                <ArrowUpCircle size={14} />
                                <span>{isActing ? 'Promoting...' : 'Promote to PM'}</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRoleChange(u, 'TEAM_MEMBER')}
                                disabled={isActing}
                                className="btn-secondary"
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.775rem',
                                  color: '#60a5fa',
                                  borderColor: 'rgba(96, 165, 250, 0.4)',
                                  backgroundColor: 'rgba(96, 165, 250, 0.1)'
                                }}
                              >
                                <ArrowDownCircle size={14} />
                                <span>{isActing ? 'Updating...' : 'Demote to Member'}</span>
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Admin Only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: TEAMS MANAGEMENT */}
      {adminTab === 'teams' && (
        <div className="card-glass" style={{ marginBottom: '32px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Layers size={20} color="var(--brand-secondary)" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Company Teams & Department Rosters
                </h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                Teams allow grouping members across projects. Assigning a team to a project grants all team members access.
              </p>
            </div>

            {isAdmin && (
              <button
                onClick={() => setIsCreateTeamModalOpen(true)}
                className="btn-primary"
                style={{ padding: '9px 16px', fontSize: '0.85rem' }}
              >
                <Plus size={16} />
                <span>+ Create New Team</span>
              </button>
            )}
          </div>

          {teams.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(99, 102, 241, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-secondary)'
                }}
              >
                <Layers size={24} />
              </div>
              <div>
                <h4 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', color: '#ffffff' }}>No Teams Created Yet</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, maxWidth: '420px' }}>
                  Create company teams (e.g. Engineering, Product Design, Operations) to assign members in bulk to projects.
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setIsCreateTeamModalOpen(true)}
                  className="btn-primary"
                  style={{ marginTop: '6px', padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  <Plus size={15} /> Create First Team
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {teams.map((t) => (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                        {t.name}
                      </h4>
                      <span
                        style={{
                          backgroundColor: 'rgba(99, 102, 241, 0.15)',
                          color: 'var(--brand-secondary)',
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)'
                        }}
                      >
                        {t.member_count ?? 0} {t.member_count === 1 ? 'member' : 'members'}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '0 0 12px 0', minHeight: '36px' }}>
                      {t.description || 'No description provided.'}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <Crown size={14} color="#fbbf24" />
                      <span>
                        Lead: <strong style={{ color: t.lead_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.lead_name || 'Unassigned'}</strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <button
                      onClick={() => setSelectedTeamForMembers(t)}
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      <Users size={14} />
                      <span>Manage Members</span>
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteTeam(t.id, t.name)}
                        title="Delete team"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          padding: '6px'
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RBAC Live Interactive Verification Widget */}
      <div className="card-glass" style={{ marginBottom: '32px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <ShieldCheck size={20} color="var(--brand-secondary)" />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
            Live Backend RBAC Enforcement Tester
          </h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Send authenticated API requests using your active JWT token to verify strict status enforcement (200 OK vs 403 Forbidden).
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <button
            onClick={() => testEndpoint('/api/auth/test/admin')}
            disabled={testing}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
          >
            <Lock size={13} color="#c084fc" />
            <span>Test Admin Endpoint (/api/auth/test/admin)</span>
            <ArrowUpRight size={13} />
          </button>

          <button
            onClick={() => testEndpoint('/api/auth/test/pm')}
            disabled={testing}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
          >
            <Lock size={13} color="#fbbf24" />
            <span>Test PM Endpoint (/api/auth/test/pm)</span>
            <ArrowUpRight size={13} />
          </button>

          <button
            onClick={() => testEndpoint('/api/auth/test/member')}
            disabled={testing}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
          >
            <Lock size={13} color="#60a5fa" />
            <span>Test Member Endpoint (/api/auth/test/member)</span>
            <ArrowUpRight size={13} />
          </button>
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {testResult.success ? (
                  <CheckCircle2 size={16} color="#10b981" />
                ) : (
                  <XCircle size={16} color="#ef4444" />
                )}
                <strong style={{ color: testResult.success ? '#34d399' : '#f87171', fontSize: '0.85rem' }}>
                  {testResult.success ? 'Access Granted' : 'Access Denied (RBAC Enforced)'}
                </strong>
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.7rem',
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
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
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
            <li>Manage users, promote and demote system roles</li>
            <li>Create and configure projects and teams</li>
            <li>Assign and remove users across all projects & teams</li>
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
            <li>Add and remove project team members</li>
            <li>Track team progress percentage</li>
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
            <li>Participate in assigned project and team chat channels</li>
            <li>In-app deadline alerts and notifications</li>
          </ul>
        </div>
      </div>

      {/* Admin Create User Modal */}
      {isCreateModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 8, 15, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateModalOpen(false);
          }}
        >
          <div
            className="card-glass"
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: 0,
              border: '1px solid var(--border-glass)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(180deg, rgba(30, 41, 69, 0.5) 0%, rgba(17, 24, 39, 0.3) 100%)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--brand-secondary)'
                  }}
                >
                  <UserPlus size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Provision New Account</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                    Create a Project Manager or Team Member without ending your session
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdminCreateUser} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Full Name <span style={{ color: 'var(--status-blocked)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Mercer"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Email Address <span style={{ color: 'var(--status-blocked)' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. alex@taskitup.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Temporary Password <span style={{ color: 'var(--status-blocked)' }}>*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Account Role
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="PROJECT_MANAGER">Project Manager (Can create & lead projects)</option>
                  <option value="TEAM_MEMBER">Team Member (Task assignee & contributor)</option>
                  <option value="ADMIN">System Administrator (Full access)</option>
                </select>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  marginTop: '4px'
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn-secondary"
                  disabled={creatingUser}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creatingUser}
                  style={{ minWidth: '130px' }}
                >
                  {creatingUser ? 'Provisioning...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Create Team Modal */}
      {isCreateTeamModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 8, 15, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateTeamModalOpen(false);
          }}
        >
          <div
            className="card-glass"
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: 0,
              border: '1px solid var(--border-glass)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(180deg, rgba(30, 41, 69, 0.5) 0%, rgba(17, 24, 39, 0.3) 100%)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--brand-secondary)'
                  }}
                >
                  <Layers size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Create Company Team</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                    Group members to assign them to projects and shared workspaces
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateTeamModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Team Name <span style={{ color: 'var(--status-blocked)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Software Engineering, Product Design, Operations"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Core domain responsibilities and deliverables..."
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Team Lead (Optional)
                </label>
                <select
                  value={teamLeadId}
                  onChange={(e) => setTeamLeadId(e.target.value ? Number(e.target.value) : '')}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">No Team Lead Appointed</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Initial Team Members
                </label>
                <div
                  style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  {usersList.map((u) => {
                    const isChecked = teamMemberIds.includes(u.id);
                    const isLead = teamLeadId && Number(teamLeadId) === u.id;
                    return (
                      <label
                        key={u.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.85rem',
                          cursor: isLead ? 'default' : 'pointer',
                          color: isLead ? 'var(--text-muted)' : 'var(--text-primary)',
                          padding: '3px 0'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked || Boolean(isLead)}
                          disabled={Boolean(isLead)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTeamMemberIds((prev) => [...prev, u.id]);
                            } else {
                              setTeamMemberIds((prev) => prev.filter((id) => id !== u.id));
                            }
                          }}
                        />
                        <span>{u.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({u.email})</span>
                        {isLead && (
                          <span style={{ fontSize: '0.7rem', color: '#fbbf24', marginLeft: 'auto', fontWeight: 600 }}>
                            (Team Lead)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  marginTop: '4px'
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsCreateTeamModalOpen(false)}
                  className="btn-secondary"
                  disabled={creatingTeam}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creatingTeam}
                  style={{ minWidth: '130px' }}
                >
                  {creatingTeam ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team Members Modal */}
      <TeamMembersModal
        team={selectedTeamForMembers}
        isOpen={Boolean(selectedTeamForMembers)}
        onClose={() => setSelectedTeamForMembers(null)}
      />
    </div>
  );
}
