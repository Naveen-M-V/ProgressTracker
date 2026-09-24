import {
  LayoutDashboard,
  FolderKanban,
  Calendar,
  CheckSquare,
  ShieldCheck,
  Plus,
  Layers,
  Users
} from 'lucide-react';
import { useTasks } from '../../context/TaskContext.js';
import { useAuth } from '../../context/AuthContext.js';

export type ActiveTab = 'dashboard' | 'kanban' | 'calendar' | 'mywork' | 'teams' | 'rbac';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { user } = useAuth();
  const {
    projects,
    teams,
    selectedProject,
    setSelectedProject,
    setIsCreateModalOpen,
    setIsProjectCreateModalOpen,
    tasks
  } = useTasks();

  const canCreateProject = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';
  const myTasksCount = user ? tasks.filter((t) => t.assignee_id === user.id && t.status !== 'COMPLETED').length : 0;

  return (
    <aside
      style={{
        width: '260px',
        borderRight: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        height: 'calc(100vh - 61px)'
      }}
    >
      {/* Top Section: Project Switcher & Navigation */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Project Selector Box */}
        <div
          style={{
            backgroundColor: 'rgba(23, 32, 54, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={13} color="var(--brand-secondary)" />
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                Active Project
              </span>
            </div>
            {canCreateProject && (
              <button
                onClick={() => setIsProjectCreateModalOpen(true)}
                title="Create New Project"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  backgroundColor: 'rgba(37, 99, 235, 0.2)',
                  border: '1px solid rgba(37, 99, 235, 0.4)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 6px',
                  fontSize: '0.7rem',
                  color: 'var(--brand-secondary)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                <Plus size={11} />
                <span>Project</span>
              </button>
            )}
          </div>

          <select
            value={selectedProject?.id || ''}
            onChange={(e) => {
              const proj = projects.find((p) => p.id === Number(e.target.value));
              if (proj) setSelectedProject(proj);
            }}
            disabled={projects.length === 0}
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 8px',
              color: projects.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              fontSize: '0.85rem',
              fontWeight: 600,
              width: '100%',
              cursor: projects.length === 0 ? 'default' : 'pointer'
            }}
          >
            {projects.length === 0 ? (
              <option value="">No Assigned Projects</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Quick New Task Button */}
        <button
          onClick={() => setIsCreateModalOpen(true)}
          disabled={!selectedProject}
          className="btn-primary"
          title={!selectedProject ? 'Create or join a project before adding tasks' : 'Create new task'}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: '0.875rem',
            justifyContent: 'center',
            boxShadow: selectedProject ? 'var(--shadow-glow)' : 'none',
            opacity: selectedProject ? 1 : 0.5,
            cursor: selectedProject ? 'pointer' : 'not-allowed'
          }}
        >
          <Plus size={16} />
          <span>New Task</span>
        </button>

        {/* Nav Links */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button
            onClick={() => onTabChange('dashboard')}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: activeTab === 'dashboard' ? 'rgba(37, 99, 235, 0.18)' : 'transparent',
              border: activeTab === 'dashboard' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
              color: activeTab === 'dashboard' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'dashboard' ? 600 : 500,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              justifyContent: 'flex-start',
              cursor: 'pointer'
            }}
          >
            <LayoutDashboard size={18} color={activeTab === 'dashboard' ? 'var(--brand-secondary)' : 'var(--text-muted)'} />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => onTabChange('kanban')}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: activeTab === 'kanban' ? 'rgba(37, 99, 235, 0.18)' : 'transparent',
              border: activeTab === 'kanban' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
              color: activeTab === 'kanban' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'kanban' ? 600 : 500,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              justifyContent: 'flex-start',
              cursor: 'pointer'
            }}
          >
            <FolderKanban size={18} color={activeTab === 'kanban' ? 'var(--brand-secondary)' : 'var(--text-muted)'} />
            <span>Kanban Board</span>
            <span
              style={{
                marginLeft: 'auto',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                padding: '2px 7px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.725rem',
                color: 'var(--text-muted)'
              }}
            >
              {tasks.length}
            </span>
          </button>

          <button
            onClick={() => onTabChange('calendar')}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: activeTab === 'calendar' ? 'rgba(37, 99, 235, 0.18)' : 'transparent',
              border: activeTab === 'calendar' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
              color: activeTab === 'calendar' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'calendar' ? 600 : 500,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              justifyContent: 'flex-start',
              cursor: 'pointer'
            }}
          >
            <Calendar size={18} color={activeTab === 'calendar' ? 'var(--brand-secondary)' : 'var(--text-muted)'} />
            <span>Shared Calendar</span>
          </button>

          <button
            onClick={() => onTabChange('mywork')}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: activeTab === 'mywork' ? 'rgba(37, 99, 235, 0.18)' : 'transparent',
              border: activeTab === 'mywork' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
              color: activeTab === 'mywork' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'mywork' ? 600 : 500,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              justifyContent: 'flex-start',
              cursor: 'pointer'
            }}
          >
            <CheckSquare size={18} color={activeTab === 'mywork' ? 'var(--brand-secondary)' : 'var(--text-muted)'} />
            <span>My Work</span>
            {myTasksCount > 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  backgroundColor: 'rgba(37, 99, 235, 0.25)',
                  color: 'var(--brand-secondary)',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.725rem'
                }}
              >
                {myTasksCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('teams')}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: activeTab === 'teams' ? 'rgba(37, 99, 235, 0.18)' : 'transparent',
              border: activeTab === 'teams' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
              color: activeTab === 'teams' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'teams' ? 600 : 500,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              justifyContent: 'flex-start',
              cursor: 'pointer'
            }}
          >
            <Users size={18} color={activeTab === 'teams' ? 'var(--brand-secondary)' : 'var(--text-muted)'} />
            <span>Teams</span>
            <span
              style={{
                marginLeft: 'auto',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                padding: '2px 7px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.725rem',
                color: 'var(--text-muted)'
              }}
            >
              {teams.length}
            </span>
          </button>

          <button
            onClick={() => onTabChange('rbac')}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: activeTab === 'rbac' ? 'rgba(37, 99, 235, 0.18)' : 'transparent',
              border: activeTab === 'rbac' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
              color: activeTab === 'rbac' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'rbac' ? 600 : 500,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              justifyContent: 'flex-start',
              cursor: 'pointer'
            }}
          >
            <ShieldCheck size={18} color={activeTab === 'rbac' ? 'var(--brand-secondary)' : 'var(--text-muted)'} />
            <span>{user?.role === 'ADMIN' ? 'Admin Dashboard' : 'RBAC & Security'}</span>
          </button>
        </nav>
      </div>

      {/* Bottom Summary Pill */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(11, 15, 25, 0.5)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <Users size={14} />
          <span>Role: <strong style={{ color: 'var(--text-primary)' }}>{user?.role}</strong></span>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Real-Time Task Sync v1.0
        </div>
      </div>
    </aside>
  );
}
