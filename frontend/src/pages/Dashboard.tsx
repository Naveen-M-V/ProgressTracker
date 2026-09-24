import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ListTodo,
  TrendingUp,
  ArrowRight,
  Plus,
  Users,
  FolderLock
} from 'lucide-react';
import { useTasks } from '../context/TaskContext.js';
import { useAuth } from '../context/AuthContext.js';
import { Task } from '../types/task.js';
import { PriorityBadge } from '../components/common/PriorityBadge.js';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { UserAvatar } from '../components/common/UserAvatar.js';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal.js';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal.js';
import { ProjectMembersModal } from '../components/projects/ProjectMembersModal.js';

interface DashboardProps {
  onNavigateToKanban: () => void;
}

export function Dashboard({ onNavigateToKanban }: DashboardProps) {
  const { user } = useAuth();
  const {
    tasks,
    selectedProject,
    setSelectedTaskId,
    selectedTaskId,
    isCreateModalOpen,
    setIsCreateModalOpen,
    setIsProjectCreateModalOpen,
    updateTaskStatus
  } = useTasks();

  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  // Metrics calculations
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: Task) => t.status === 'COMPLETED').length;
  const inProgressTasks = tasks.filter((t: Task) => t.status === 'IN_PROGRESS').length;
  const todoTasks = tasks.filter((t: Task) => t.status === 'TODO').length;
  const blockedTasks = tasks.filter((t: Task) => t.status === 'BLOCKED').length;

  const myAssignedTasks = user ? tasks.filter((t: Task) => t.assignee_id === user.id) : [];
  const myPendingTasks = myAssignedTasks.filter((t: Task) => t.status !== 'COMPLETED');

  // Overdue check
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdueTasks = tasks.filter((t: Task) => {
    if (!t.due_date || t.status === 'COMPLETED') return false;
    const due = new Date(t.due_date);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < now.getTime();
  });

  const progressPercentage =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : selectedProject?.progress?.progress_percentage || 0;

  // Dedicated empty state when user has no assigned project
  if (!selectedProject) {
    return (
      <div
        style={{
          flex: 1,
          padding: '48px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '16px'
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-secondary)'
          }}
        >
          <FolderLock size={32} />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
          No Projects Assigned
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', fontSize: '0.95rem', margin: 0 }}>
          You are not currently assigned to any active project. Only projects you lead or belong to are visible in your workspace dashboard.
        </p>
        {(user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER') && (
          <button
            onClick={() => setIsProjectCreateModalOpen(true)}
            className="btn-primary"
            style={{ marginTop: '8px', padding: '10px 20px' }}
          >
            <Plus size={16} /> Create New Project
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        padding: '28px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        overflowY: 'auto'
      }}
    >
      {/* Welcome & Project Progress Hero */}
      <div
        className="card-glass"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 69, 0.7) 0%, rgba(17, 24, 39, 0.85) 100%)',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--brand-secondary)'
                }}
              >
                Project Overview
              </span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {selectedProject?.status || 'ACTIVE'}
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
              {selectedProject.name}
            </h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.9rem', maxWidth: '680px' }}>
              {selectedProject.description || 'Collaborative project execution workspace and delivery pipeline.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setIsMembersModalOpen(true)}
              className="btn-secondary"
              style={{ padding: '9px 16px', fontSize: '0.85rem' }}
              title="View and manage project members"
            >
              <Users size={16} />
              <span>Members ({selectedProject.member_count ?? 1})</span>
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-primary"
              style={{ padding: '9px 16px', fontSize: '0.85rem' }}
            >
              <Plus size={16} /> New Task
            </button>
            <button
              onClick={onNavigateToKanban}
              className="btn-secondary"
              style={{ padding: '9px 16px', fontSize: '0.85rem' }}
            >
              Open Kanban Board <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Dynamic Project Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Overall Completion Rate
            </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--brand-secondary)' }}>
              {progressPercentage}%
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)'
            }}
          >
            <div
              style={{
                width: `${progressPercentage}%`,
                height: '100%',
                background: 'var(--brand-gradient)',
                borderRadius: 'var(--radius-full)',
                transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 0 12px var(--brand-glow)'
              }}
            />
          </div>

          {/* Quick status breakdown badges */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <strong>{todoTasks}</strong> To Do
            </span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>
              <strong>{inProgressTasks}</strong> In Progress
            </span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ fontSize: '0.8rem', color: '#34d399' }}>
              <strong>{completedTasks}</strong> Completed
            </span>
            {blockedTasks > 0 && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span style={{ fontSize: '0.8rem', color: '#f87171' }}>
                  <strong>{blockedTasks}</strong> Blocked
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* Total Tasks */}
        <div
          className="card-glass"
          style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa'
            }}
          >
            <ListTodo size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Total Tasks
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {totalTasks}
            </div>
          </div>
        </div>

        {/* My Assigned Tasks */}
        <div
          className="card-glass"
          style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-secondary)'
            }}
          >
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              My Pending Tasks
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {myPendingTasks.length}
            </div>
          </div>
        </div>

        {/* Tasks Completed */}
        <div
          className="card-glass"
          style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399'
            }}
          >
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Tasks Completed
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {completedTasks}
            </div>
          </div>
        </div>

        {/* Overdue / Alerts */}
        <div
          className="card-glass"
          style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: overdueTasks.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(100, 116, 139, 0.15)',
              border: overdueTasks.length > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: overdueTasks.length > 0 ? '#f87171' : 'var(--text-muted)'
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Overdue Tasks
            </div>
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: overdueTasks.length > 0 ? '#f87171' : 'var(--text-primary)'
              }}
            >
              {overdueTasks.length}
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Section: My Pending Work + Team Task Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Left Widget: My Pending Tasks */}
        <div className="card-glass" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color="var(--brand-secondary)" />
              My Assigned Deliverables
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {myPendingTasks.length} pending
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {myPendingTasks.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                🎉 You have no pending tasks assigned right now!
              </div>
            ) : (
              myPendingTasks.slice(0, 5).map((t: Task) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'rgba(17, 24, 39, 0.4)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'all var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                    e.currentTarget.style.borderColor = 'var(--border-focus)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.4)';
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <PriorityBadge priority={t.priority} size="sm" />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        #TASK-{t.id}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {t.title}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StatusBadge status={t.status} size="sm" />
                    {t.status !== 'COMPLETED' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTaskStatus(t.id, t.status === 'TODO' ? 'IN_PROGRESS' : 'COMPLETED');
                        }}
                        style={{
                          background: 'rgba(37, 99, 235, 0.2)',
                          color: '#93c5fd',
                          border: '1px solid rgba(37, 99, 235, 0.4)',
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.725rem',
                          fontWeight: 600
                        }}
                        title={t.status === 'TODO' ? 'Start Task' : 'Complete Task'}
                      >
                        {t.status === 'TODO' ? 'Start' : 'Done'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Widget: High Priority & Overdue Focus */}
        <div className="card-glass" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="#f97316" />
              High Priority & Urgent Focus
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Critical paths
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tasks
              .filter((t: Task) => (t.priority === 'URGENT' || t.priority === 'HIGH') && t.status !== 'COMPLETED')
              .slice(0, 5)
              .map((t: Task) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'rgba(17, 24, 39, 0.4)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'all var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                    e.currentTarget.style.borderColor = 'var(--border-focus)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.4)';
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <PriorityBadge priority={t.priority} size="sm" />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString()}` : 'No date'}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {t.title}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {t.assignee_name ? (
                      <UserAvatar name={t.assignee_name} avatarUrl={t.assignee_avatar} size={24} />
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Unassigned
                      </span>
                    )}
                    <StatusBadge status={t.status} size="sm" />
                  </div>
                </div>
              ))}
            {tasks.filter((t: Task) => (t.priority === 'URGENT' || t.priority === 'HIGH') && t.status !== 'COMPLETED').length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No critical or urgent tasks pending!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <TaskCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />

      <ProjectMembersModal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
      />
    </div>
  );
}
