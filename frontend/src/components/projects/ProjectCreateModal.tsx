import { useState, FormEvent } from 'react';
import { X, Briefcase } from 'lucide-react';
import { useTasks } from '../../context/TaskContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface ProjectCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectCreateModal({ isOpen, onClose }: ProjectCreateModalProps) {
  const { user } = useAuth();
  const { teams, users, createProject } = useTasks();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState<number | ''>('');
  const [managerId, setManagerId] = useState<number | ''>(user?.role === 'PROJECT_MANAGER' ? user.id : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const eligibleManagers = users.filter((u) => u.role === 'PROJECT_MANAGER' || u.role === 'ADMIN');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Project name is required');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        team_id: teamId ? Number(teamId) : null,
        manager_id: managerId ? Number(managerId) : null
      });

      setName('');
      setDescription('');
      setTeamId('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
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
          maxWidth: '560px',
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
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                border: '1px solid rgba(79, 70, 229, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8'
              }}
            >
              <Briefcase size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Create New Project</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Set up a workspace and assign team access
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              padding: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {errorMsg && (
            <div
              style={{
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

          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Project Name <span style={{ color: 'var(--status-blocked)' }}>*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Operations Cloud Migration"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.9rem'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Scope, key deliverables, and team goals..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Team Assignment */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Assigned Team
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : '')}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.875rem'
              }}
            >
              <option value="">No Team (Cross-functional)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} Team
                </option>
              ))}
            </select>
            <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
              Members of the selected team will automatically gain access to this project.
            </p>
          </div>

          {/* Manager Assignment */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Project Manager
            </label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : '')}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.875rem'
              }}
            >
              <option value="">Assign Later</option>
              {eligibleManagers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)',
              marginTop: '4px'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              style={{ minWidth: '130px' }}
            >
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
