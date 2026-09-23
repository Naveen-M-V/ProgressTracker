import { useState } from 'react';
import {
  Search,
  Plus,
  RotateCcw,
  Wifi,
  WifiOff,
  FolderKanban
} from 'lucide-react';
import { useTasks, TaskFilterOptions } from '../context/TaskContext.js';
import { useAuth } from '../context/AuthContext.js';
import { TaskStatus, TaskPriority, Task } from '../types/task.js';
import { KanbanColumn } from '../components/tasks/KanbanColumn.js';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal.js';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal.js';

export function KanbanBoard() {
  const { user } = useAuth();
  const {
    tasks,
    selectedProject,
    users,
    filters,
    setFilters,
    resetFilters,
    updateTaskStatus,
    selectedTaskId,
    setSelectedTaskId,
    isCreateModalOpen,
    setIsCreateModalOpen,
    socketConnected
  } = useTasks();

  const [createInitialStatus, setCreateInitialStatus] = useState<TaskStatus>('TODO');

  const handleOpenCreate = (initialStatus: TaskStatus = 'TODO') => {
    setCreateInitialStatus(initialStatus);
    setIsCreateModalOpen(true);
  };

  const handleDropTask = async (taskId: number, newStatus: TaskStatus) => {
    await updateTaskStatus(taskId, newStatus);
  };

  // Filter tasks locally by status
  const filterByStatus = (status: TaskStatus) => {
    return tasks
      .filter((t: Task) => t.status === status)
      .sort((a: Task, b: Task) => (a.position_order || 0) - (b.position_order || 0) || b.id - a.id);
  };

  const todoTasks = filterByStatus('TODO');
  const inProgressTasks = filterByStatus('IN_PROGRESS');
  const reviewTasks = filterByStatus('REVIEW');
  const blockedTasks = filterByStatus('BLOCKED');
  const completedTasks = filterByStatus('COMPLETED');

  const hasActiveFilters = Boolean(
    filters.search || filters.priority || filters.assignee_id
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}>
      {/* Board Top Toolbar */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(17, 24, 39, 0.4)',
          backdropFilter: 'var(--backdrop-blur)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        {/* Project Info & Live Sync Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderKanban size={20} color="var(--brand-secondary)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              {selectedProject?.name || 'Project Board'}
            </h2>
          </div>

          {/* Real-time Socket Indicator */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: socketConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: socketConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              fontSize: '0.725rem',
              fontWeight: 600,
              color: socketConnected ? '#34d399' : '#f87171'
            }}
            title={socketConnected ? 'Live synchronization active via WebSockets' : 'Connecting to live socket...'}
          >
            {socketConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{socketConnected ? 'Live' : 'Connecting'}</span>
          </div>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            ({tasks.length} total tasks)
          </span>
        </div>

        {/* Filter Controls & Create Task */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px'
            }}
          >
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Filter tasks..."
              value={filters.search || ''}
              onChange={(e) =>
                setFilters((prev: TaskFilterOptions) => ({ ...prev, search: e.target.value }))
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                width: '150px',
                outline: 'none'
              }}
            />
          </div>

          {/* Priority Dropdown */}
          <select
            value={filters.priority || ''}
            onChange={(e) =>
              setFilters((prev: TaskFilterOptions) => ({
                ...prev,
                priority: e.target.value ? (e.target.value as TaskPriority) : undefined
              }))
            }
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 10px',
              color: 'var(--text-primary)',
              fontSize: '0.825rem'
            }}
          >
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={filters.assignee_id !== undefined ? String(filters.assignee_id) : ''}
            onChange={(e) => {
              const val = e.target.value;
              setFilters((prev: TaskFilterOptions) => ({
                ...prev,
                assignee_id: val === '' ? undefined : val === 'unassigned' ? 'unassigned' : Number(val)
              }));
            }}
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 10px',
              color: 'var(--text-primary)',
              fontSize: '0.825rem'
            }}
          >
            <option value="">All Assignees</option>
            {user && <option value={user.id}>Assigned to Me</option>}
            <option value="unassigned">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="btn-secondary"
              style={{ padding: '6px 10px', fontSize: '0.8rem' }}
              title="Reset all filters"
            >
              <RotateCcw size={13} />
            </button>
          )}

          {/* New Task Button */}
          <button
            onClick={() => handleOpenCreate('TODO')}
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Horizontal Kanban Columns Container */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: '16px',
          padding: '20px 24px',
          overflowX: 'auto',
          alignItems: 'flex-start'
        }}
      >
        <KanbanColumn
          status="TODO"
          title="To Do"
          dotColor="#94a3b8"
          tasks={todoTasks}
          onTaskClick={(task: Task) => setSelectedTaskId(task.id)}
          onDropTask={handleDropTask}
          onQuickAdd={handleOpenCreate}
        />

        <KanbanColumn
          status="IN_PROGRESS"
          title="In Progress"
          dotColor="#3b82f6"
          tasks={inProgressTasks}
          onTaskClick={(task: Task) => setSelectedTaskId(task.id)}
          onDropTask={handleDropTask}
          onQuickAdd={handleOpenCreate}
        />

        <KanbanColumn
          status="REVIEW"
          title="In Review"
          dotColor="#f59e0b"
          tasks={reviewTasks}
          onTaskClick={(task: Task) => setSelectedTaskId(task.id)}
          onDropTask={handleDropTask}
          onQuickAdd={handleOpenCreate}
        />

        <KanbanColumn
          status="BLOCKED"
          title="Blocked"
          dotColor="#ef4444"
          tasks={blockedTasks}
          onTaskClick={(task: Task) => setSelectedTaskId(task.id)}
          onDropTask={handleDropTask}
          onQuickAdd={handleOpenCreate}
        />

        <KanbanColumn
          status="COMPLETED"
          title="Completed"
          dotColor="#10b981"
          tasks={completedTasks}
          onTaskClick={(task: Task) => setSelectedTaskId(task.id)}
          onDropTask={handleDropTask}
          onQuickAdd={handleOpenCreate}
        />
      </div>

      {/* Modals */}
      <TaskCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        initialStatus={createInitialStatus}
      />

      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
