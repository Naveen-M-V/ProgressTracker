import { useState, DragEvent } from 'react';
import { Plus } from 'lucide-react';
import { Task, TaskStatus } from '../../types/task.js';
import { TaskCard } from './TaskCard.js';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  dotColor: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDropTask: (taskId: number, newStatus: TaskStatus) => void;
  onQuickAdd: (status: TaskStatus) => void;
}

export function KanbanColumn({
  status,
  title,
  dotColor,
  tasks,
  onTaskClick,
  onDropTask,
  onQuickAdd
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    // Only turn off if leaving the column boundary
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const rawId = e.dataTransfer.getData('text/plain');
    const taskId = parseInt(rawId, 10);
    if (!isNaN(taskId)) {
      onDropTask(taskId, status);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: '1 1 280px',
        minWidth: '270px',
        maxWidth: '340px',
        backgroundColor: isDragOver ? 'rgba(30, 41, 69, 0.6)' : 'rgba(17, 24, 39, 0.45)',
        border: isDragOver ? `2px dashed ${dotColor}` : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 170px)',
        transition: 'all var(--transition-fast)',
        boxShadow: isDragOver ? `0 0 16px ${dotColor}33` : 'none'
      }}
    >
      {/* Column Header */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(23, 32, 54, 0.3)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: dotColor,
              boxShadow: `0 0 8px ${dotColor}88`
            }}
          />
          <h3 style={{ fontSize: '0.925rem', fontWeight: 700, margin: 0 }}>{title}</h3>
          <span
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--text-secondary)',
              fontSize: '0.725rem',
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
              marginLeft: '4px'
            }}
          >
            {tasks.length}
          </span>
        </div>

        <button
          onClick={() => onQuickAdd(status)}
          title={`Add task to ${title}`}
          style={{
            background: 'transparent',
            color: 'var(--text-muted)',
            padding: '4px',
            borderRadius: 'var(--radius-sm)'
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Column Task Cards Scroll Area */}
      <div
        style={{
          padding: '12px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {tasks.length === 0 ? (
          <div
            style={{
              flex: 1,
              minHeight: '120px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed rgba(255, 255, 255, 0.06)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              padding: '16px',
              textAlign: 'center'
            }}
          >
            <span>No tasks in {title}</span>
            <button
              onClick={() => onQuickAdd(status)}
              style={{
                marginTop: '8px',
                background: 'transparent',
                color: 'var(--brand-secondary)',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              + Create one
            </button>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))
        )}
      </div>

      {/* Quick Add Footer Button */}
      <div style={{ padding: '8px 12px 12px' }}>
        <button
          onClick={() => onQuickAdd(status)}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all var(--transition-fast)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <Plus size={14} />
          <span>Add Task</span>
        </button>
      </div>
    </div>
  );
}
