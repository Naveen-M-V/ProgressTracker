import { useState, useMemo } from 'react';
import {
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  Search,
  Filter,
  CheckSquare,
  MessageSquare,
  Folder,
  ArrowRight,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useTasks } from '../context/TaskContext.js';
import { Task, TaskStatus, TaskPriority } from '../types/task.js';
import { PriorityBadge } from '../components/common/PriorityBadge.js';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal.js';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal.js';

type SectionFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'completed';

export function MyWork() {
  const { user } = useAuth();
  const {
    tasks,
    projects,
    selectedTaskId,
    setSelectedTaskId,
    isCreateModalOpen,
    setIsCreateModalOpen,
    updateTaskStatus
  } = useTasks();

  const [activeSection, setActiveSection] = useState<SectionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all');

  // Filter tasks strictly assigned to current logged-in user
  const myTasks = useMemo(() => {
    if (!user) return [];
    return tasks.filter((t) => t.assignee_id === user.id);
  }, [tasks, user]);

  // Apply search and dropdown filters
  const filteredMyTasks = useMemo(() => {
    return myTasks.filter((task) => {
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDesc = task.description?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc) return false;
      }

      // Priority filter
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
        return false;
      }

      // Project filter
      if (projectFilter !== 'all' && task.project_id !== projectFilter) {
        return false;
      }

      return true;
    });
  }, [myTasks, searchQuery, priorityFilter, projectFilter]);

  // Partition into 4 PRD Section 6 Buckets
  const partitioned = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue: Task[] = [];
    const dueToday: Task[] = [];
    const upcoming: Task[] = [];
    const completed: Task[] = [];

    filteredMyTasks.forEach((task) => {
      if (task.status === 'COMPLETED') {
        completed.push(task);
        return;
      }

      if (!task.due_date) {
        upcoming.push(task);
        return;
      }

      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);

      const diffTime = due.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        overdue.push(task);
      } else if (diffDays === 0) {
        dueToday.push(task);
      } else {
        upcoming.push(task);
      }
    });

    // Sort overdue by most overdue first
    overdue.sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime());
    // Sort today and upcoming by closest due date
    dueToday.sort((a, b) => a.position_order - b.position_order);
    upcoming.sort((a, b) => new Date(a.due_date || '9999-12-31').getTime() - new Date(b.due_date || '9999-12-31').getTime());
    // Sort completed by most recently updated
    completed.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return { overdue, dueToday, upcoming, completed };
  }, [filteredMyTasks]);

  const handleToggleComplete = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const newStatus: TaskStatus = task.status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED';
    await updateTaskStatus(task.id, newStatus);
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>, taskId: number) => {
    e.stopPropagation();
    const newStatus = e.target.value as TaskStatus;
    await updateTaskStatus(taskId, newStatus);
  };

  const formatDueDateLabel = (dueDateStr: string | null) => {
    if (!dueDateStr) return { text: 'No deadline', color: 'var(--text-muted)', bg: 'transparent' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const days = Math.abs(diffDays);
      return {
        text: `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`,
        color: '#f87171',
        bg: 'rgba(239, 68, 68, 0.15)'
      };
    }
    if (diffDays === 0) {
      return {
        text: 'Due Today',
        color: '#fbbf24',
        bg: 'rgba(245, 158, 11, 0.15)'
      };
    }
    if (diffDays === 1) {
      return {
        text: 'Due Tomorrow',
        color: '#60a5fa',
        bg: 'rgba(59, 130, 246, 0.15)'
      };
    }
    return {
      text: `Due in ${diffDays} days (${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`,
      color: 'var(--text-secondary)',
      bg: 'rgba(255, 255, 255, 0.05)'
    };
  };

  const renderTaskCard = (task: Task) => {
    const isCompleted = task.status === 'COMPLETED';
    const dueInfo = formatDueDateLabel(task.due_date);

    return (
      <div
        key={task.id}
        onClick={() => setSelectedTaskId(task.id)}
        style={{
          backgroundColor: isCompleted ? 'rgba(15, 23, 42, 0.4)' : 'rgba(23, 32, 54, 0.65)',
          border: isCompleted ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          opacity: isCompleted ? 0.75 : 1
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--brand-secondary)';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = isCompleted ? 'rgba(255, 255, 255, 0.05)' : 'var(--border-subtle)';
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Quick Complete Checkbox */}
        <button
          onClick={(e) => handleToggleComplete(e, task)}
          title={isCompleted ? 'Mark as In Progress' : 'Mark as Completed'}
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '6px',
            border: isCompleted ? '2px solid #34d399' : '2px solid rgba(255, 255, 255, 0.25)',
            backgroundColor: isCompleted ? '#34d399' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            transition: 'all 0.15s ease'
          }}
        >
          {isCompleted && <CheckCircle2 size={15} color="#0b0f19" />}
        </button>

        {/* Task Details */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                textDecoration: isCompleted ? 'line-through' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {task.title}
            </span>

            <PriorityBadge priority={task.priority} size="sm" />

            {task.project_name && (
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Folder size={11} />
                {task.project_name}
              </span>
            )}
          </div>

          {/* Metadata Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: dueInfo.bg,
                color: dueInfo.color,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Clock size={11} />
              {dueInfo.text}
            </span>

            {(task.subtask_count || 0) > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckSquare size={12} />
                {task.subtasks_completed || 0}/{task.subtask_count} subtasks
              </span>
            )}

            {(task.comment_count || 0) > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MessageSquare size={12} />
                {task.comment_count}
              </span>
            )}
          </div>
        </div>

        {/* Inline Status Dropdown (PRD Section 6) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ position: 'relative' }}>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(e, task.id)}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundColor: 'rgba(11, 15, 25, 0.7)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 28px 5px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color:
                  task.status === 'COMPLETED'
                    ? '#34d399'
                    : task.status === 'BLOCKED'
                    ? '#f87171'
                    : task.status === 'REVIEW'
                    ? '#fbbf24'
                    : task.status === 'IN_PROGRESS'
                    ? '#60a5fa'
                    : '#94a3b8',
                cursor: 'pointer'
              }}
            >
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="REVIEW">In Review</option>
              <option value="BLOCKED">Blocked</option>
              <option value="COMPLETED">Completed</option>
            </select>
            <ChevronDown
              size={13}
              color="var(--text-muted)"
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>

          <button
            onClick={() => setSelectedTaskId(task.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Open Details"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  };

  const renderSection = (
    title: string,
    tasksList: Task[],
    icon: React.ReactNode,
    accentColor: string,
    emptyMsg: string
  ) => {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {icon}
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {title}
            </h3>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: accentColor,
                backgroundColor: `${accentColor}18`,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)'
              }}
            >
              {tasksList.length}
            </span>
          </div>
        </div>

        {/* Section Task Cards */}
        {tasksList.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              backgroundColor: 'rgba(23, 32, 54, 0.25)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)',
              fontSize: '0.85rem'
            }}
          >
            {emptyMsg}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tasksList.map(renderTaskCard)}
          </div>
        )}
      </div>
    );
  };

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
      {/* Header & Quick Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            My Work
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Focused personal workspace for <strong style={{ color: 'var(--brand-secondary)' }}>{user?.name}</strong>. Track immediate deadlines, overdue tasks, and completed milestones.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary"
          style={{ padding: '9px 16px', fontSize: '0.875rem' }}
        >
          <Plus size={16} />
          <span>New Task</span>
        </button>
      </div>

      {/* KPI Overview Pills */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}
      >
        {/* Overdue KPI */}
        <div
          onClick={() => setActiveSection(activeSection === 'overdue' ? 'all' : 'overdue')}
          style={{
            backgroundColor: activeSection === 'overdue' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(23, 32, 54, 0.6)',
            border: activeSection === 'overdue' ? '1px solid #ef4444' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)' }}>
              <AlertTriangle size={18} color="#ef4444" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>OVERDUE</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f87171' }}>
                {partitioned.overdue.length}
              </div>
            </div>
          </div>
        </div>

        {/* Due Today KPI */}
        <div
          onClick={() => setActiveSection(activeSection === 'today' ? 'all' : 'today')}
          style={{
            backgroundColor: activeSection === 'today' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(23, 32, 54, 0.6)',
            border: activeSection === 'today' ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
              <Clock size={18} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>DUE TODAY</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>
                {partitioned.dueToday.length}
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming KPI */}
        <div
          onClick={() => setActiveSection(activeSection === 'upcoming' ? 'all' : 'upcoming')}
          style={{
            backgroundColor: activeSection === 'upcoming' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(23, 32, 54, 0.6)',
            border: activeSection === 'upcoming' ? '1px solid #3b82f6' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.15)' }}>
              <Calendar size={18} color="#60a5fa" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>UPCOMING</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#60a5fa' }}>
                {partitioned.upcoming.length}
              </div>
            </div>
          </div>
        </div>

        {/* Completed KPI */}
        <div
          onClick={() => setActiveSection(activeSection === 'completed' ? 'all' : 'completed')}
          style={{
            backgroundColor: activeSection === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(23, 32, 54, 0.6)',
            border: activeSection === 'completed' ? '1px solid #10b981' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.15)' }}>
              <CheckCircle2 size={18} color="#34d399" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>COMPLETED</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>
                {partitioned.completed.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card-glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '12px 18px',
          flexWrap: 'wrap'
        }}
      >
        {/* Search Input */}
        <div
          style={{
            position: 'relative',
            flex: '1 1 240px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Search
            size={16}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '12px' }}
          />
          <input
            type="text"
            placeholder="Filter tasks by title or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 36px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          />
        </div>

        {/* Priority Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} color="var(--text-muted)" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* Project Filter */}
        <div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Section View Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          {(['all', 'overdue', 'today', 'upcoming', 'completed'] as SectionFilter[]).map((sec) => (
            <button
              key={sec}
              onClick={() => setActiveSection(sec)}
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: activeSection === sec ? 'var(--brand-primary)' : 'transparent',
                color: activeSection === sec ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {sec}
            </button>
          ))}
        </div>
      </div>

      {/* Partitioned Content (PRD Section 6) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {/* Overdue Section */}
        {(activeSection === 'all' || activeSection === 'overdue') && (
          renderSection(
            'Overdue',
            partitioned.overdue,
            <AlertTriangle size={18} color="#ef4444" />,
            '#ef4444',
            '🎉 No overdue tasks! You are completely on track.'
          )
        )}

        {/* Due Today Section */}
        {(activeSection === 'all' || activeSection === 'today') && (
          renderSection(
            'Due Today',
            partitioned.dueToday,
            <Clock size={18} color="#f59e0b" />,
            '#f59e0b',
            '⚡ Nothing due today. Review upcoming tasks or take a breath!'
          )
        )}

        {/* Upcoming Section */}
        {(activeSection === 'all' || activeSection === 'upcoming') && (
          renderSection(
            'Upcoming Deliverables',
            partitioned.upcoming,
            <Calendar size={18} color="#60a5fa" />,
            '#60a5fa',
            '📋 No upcoming tasks scheduled.'
          )
        )}

        {/* Completed Section */}
        {(activeSection === 'all' || activeSection === 'completed') && (
          renderSection(
            'Completed',
            partitioned.completed,
            <CheckCircle2 size={18} color="#10b981" />,
            '#10b981',
            'No completed tasks yet. Finish a task to see it here!'
          )
        )}
      </div>

      {/* Task Creation & Detail Modals */}
      <TaskCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        initialStatus="TODO"
      />

      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
