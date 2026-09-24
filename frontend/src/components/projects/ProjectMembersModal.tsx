import { useState, useEffect } from 'react';
import { X, Users, UserPlus, Trash2, Crown, Layers } from 'lucide-react';
import { useTasks } from '../../context/TaskContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { ProjectMember } from '../../types/project.js';
import { UserAvatar } from '../common/UserAvatar.js';
import { RoleBadge } from '../common/RoleBadge.js';

interface ProjectMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectMembersModal({ isOpen, onClose }: ProjectMembersModalProps) {
  const { user } = useAuth();
  const {
    selectedProject,
    users,
    teams,
    updateProject,
    fetchProjectMembers,
    addProjectMember,
    removeProjectMember
  } = useTasks();

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [roleInProject, setRoleInProject] = useState('MEMBER');
  const [actionLoading, setActionLoading] = useState(false);
  const [assignedTeamId, setAssignedTeamId] = useState<number | ''>(selectedProject?.team_id || '');
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canManageMembers =
    user?.role === 'ADMIN' || (user?.role === 'PROJECT_MANAGER' && selectedProject?.manager_id === user.id);

  const loadMembers = async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const data = await fetchProjectMembers(selectedProject.id);
      setMembers(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load project members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && selectedProject) {
      loadMembers();
      setAssignedTeamId(selectedProject.team_id || '');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, selectedProject?.id, selectedProject?.team_id]);

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    setIsSavingTeam(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const newTeamId = assignedTeamId ? Number(assignedTeamId) : null;
      await updateProject(selectedProject.id, { team_id: newTeamId });
      const teamObj = teams.find((t) => t.id === newTeamId);
      setSuccessMsg(
        teamObj
          ? `Assigned project to ${teamObj.name} Team. All members of ${teamObj.name} can now access this project.`
          : 'Project is now unassigned from any specific team (Cross-functional).'
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update project team assignment');
    } finally {
      setIsSavingTeam(false);
    }
  };

  if (!isOpen || !selectedProject) return null;

  // Filter users not already in the project
  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsers = users.filter((u) => !memberUserIds.has(u.id));

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const added = await addProjectMember(selectedProject.id, Number(selectedUserId), roleInProject);
      if (added) {
        setSuccessMsg(`Added ${added.name} to ${selectedProject.name}`);
        setSelectedUserId('');
        await loadMembers();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add member to project');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (userId: number, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this project?`)) {
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const success = await removeProjectMember(selectedProject.id, userId);
      if (success) {
        setSuccessMsg(`Removed ${memberName} from project`);
        await loadMembers();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove member');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card-glass"
        style={{
          width: '100%',
          maxWidth: '620px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          border: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Header */}
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
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand-secondary)'
              }}
            >
              <Users size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                {selectedProject.name} — Members
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                {members.length} {members.length === 1 ? 'member' : 'members'} assigned to this project
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Banners */}
        {errorMsg && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#f87171',
              fontSize: '0.825rem'
            }}
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '10px 14px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#34d399',
              fontSize: '0.825rem'
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Team Assignment Card */}
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={15} color="var(--brand-secondary)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Assigned Company Team
                </span>
              </div>
              {selectedProject.team_name ? (
                <span
                  style={{
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    color: 'var(--brand-secondary)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: 'var(--radius-full)',
                    padding: '2px 8px',
                    fontSize: '0.725rem',
                    fontWeight: 700
                  }}
                >
                  {selectedProject.team_name} Team
                </span>
              ) : (
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  None (Cross-functional)
                </span>
              )}
            </div>

            <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
              Assigning a team automatically grants all of its members access to this project.
            </p>

            {canManageMembers ? (
              <form onSubmit={handleSaveTeam} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select
                  value={assignedTeamId}
                  onChange={(e) => setAssignedTeamId(e.target.value ? Number(e.target.value) : '')}
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="">No Team (Cross-functional)</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.member_count ?? 0} {t.member_count === 1 ? 'member' : 'members'})
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={isSavingTeam || (assignedTeamId === (selectedProject.team_id || ''))}
                  className="btn-secondary"
                  style={{
                    padding: '8px 14px',
                    fontSize: '0.825rem',
                    whiteSpace: 'nowrap',
                    opacity: isSavingTeam || (assignedTeamId === (selectedProject.team_id || '')) ? 0.5 : 1
                  }}
                >
                  {isSavingTeam ? 'Saving...' : 'Save Team'}
                </button>
              </form>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {selectedProject.team_name
                  ? `This project belongs to ${selectedProject.team_name}.`
                  : 'This project is cross-functional.'}
              </div>
            )}
          </div>

          {/* Add Member Form (Admin or PM only) */}
          {canManageMembers && (
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <UserPlus size={15} color="var(--brand-secondary)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Add Member to Project
                </span>
              </div>

              {availableUsers.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  All registered users are already members of this project.
                </p>
              ) : (
                <form
                  onSubmit={handleAddMember}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: '10px', alignItems: 'center' }}
                >
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="">Select a user...</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email}) — {u.role}
                      </option>
                    ))}
                  </select>

                  <select
                    value={roleInProject}
                    onChange={(e) => setRoleInProject(e.target.value)}
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="LEAD_DEV">Lead Dev</option>
                    <option value="DESIGNER">Designer</option>
                    <option value="QA">QA</option>
                  </select>

                  <button
                    type="submit"
                    disabled={!selectedUserId || actionLoading}
                    className="btn-primary"
                    style={{
                      padding: '8px 14px',
                      fontSize: '0.825rem',
                      opacity: !selectedUserId || actionLoading ? 0.6 : 1
                    }}
                  >
                    {actionLoading ? 'Adding...' : 'Add'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Members List */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
              Current Project Members ({members.length})
            </div>

            {loading ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading members...</p>
            ) : members.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No members found in this project.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {members.map((member) => {
                  const isManager = member.user_id === selectedProject.manager_id;

                  return (
                    <div
                      key={member.user_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <UserAvatar name={member.name} avatarUrl={member.avatar_url} size={34} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {member.name}
                            </span>
                            {isManager && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                  color: '#fbbf24',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '1px 6px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700
                                }}
                              >
                                <Crown size={11} /> Project Lead
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                            {member.email} • {member.role_in_project}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <RoleBadge role={member.role} size="sm" />

                        {canManageMembers && !isManager && (
                          <button
                            onClick={() => handleRemoveMember(member.user_id, member.name)}
                            disabled={actionLoading}
                            title="Remove member from project"
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              borderRadius: 'var(--radius-sm)',
                              color: '#f87171',
                              padding: '5px 8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.75rem',
                              transition: 'var(--transition-fast)'
                            }}
                          >
                            <Trash2 size={13} />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(11, 15, 25, 0.4)'
          }}
        >
          <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
