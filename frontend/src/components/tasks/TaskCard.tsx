import { useState, DragEvent } from 'react';
import { CheckSquare, MessageSquare, Calendar, Paperclip } from 'lucide-react';
import { Task } from '../../types/task.js';
import { PriorityBadge } from '../common/PriorityBadge.js';
import { UserAvatar } from '../common/UserAvatar.js';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onDragStart?: (e: DragEvent, task: Task) => void;
}

export function TaskCard({ task, onClick, onDragStart }: TaskCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Format due date relative/friendly
  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const due = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (task.item_type === 'EVENT') {
      if (diffDays === 0) return { text: 'Event Today', isToday: true };
      if (diffDays === 1) return { text: 'Event Tomorrow', isUpcoming: true };
      return {
        text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isUpcoming: diffDays > 0,
        isOverdue: diffDays < 0
      };
    }

    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
    } else if (diffDays === 0) {
      return { text: 'Due today', isToday: true };
    } else if (diffDays === 1) {
      return { text: 'Tomorrow', isUpcoming: true };
    } else {
      return {
        text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isUpcoming: true
      };
    }
  };

  const dueInfo = formatDueDate(task.due_date);

  return (
    <div
      draggable
      onDragStart={(e) => {
        setIsDragging(true);
        e.dataTransfer.setData('text/plain', String(task.id));
        e.dataTransfer.effectAllowed = 'move';
        if (onDragStart) onDragStart(e, task);
      }}
      onDragEnd={() => setIsDragging(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        backgroundColor: isHovered ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        border: isHovered
          ? '1px solid var(--border-focus)'
          : task.item_type === 'EVENT'
          ? '1px solid rgba(168, 85, 247, 0.35)'
          : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '14px',
        marginBottom: '10px',
        cursor: 'grab',
        transition: 'all var(--transition-fast)',
        transform: isHovered ? 'translateY(-2px)' : 'none',
        boxShadow: isHovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        position: 'relative'
      }}
    >
      {/* Top Meta Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {task.item_type === 'EVENT' && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '2px 6px',
                borderRadius: '999px',
                backgroundColor: 'rgba(168, 85, 247, 0.25)',
                color: '#d8b4fe',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <Calendar size={10} /> Event
            </span>
          )}
          <PriorityBadge priority={task.priority} size="sm" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          {/* Subtasks Count */}
          {(task.subtask_count || 0) > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                color:
                  (task.subtasks_completed || 0) === task.subtask_count
                    ? 'var(--status-completed)'
                    : 'var(--text-secondary)'
              }}
              title="Checklist progress"
            >
              <CheckSquare size={13} />
              {task.subtasks_completed || 0}/{task.subtask_count}
            </span>
          )}

          {/* Comments Count */}
          {(task.comment_count || 0) > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Comments">
              <MessageSquare size={13} />
              {task.comment_count}
            </span>
          )}

          {/* Attachments Count */}
          {(task.attachment_count || 0) > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Attachments">
              <Paperclip size={13} />
              {task.attachment_count}
            </span>
          )}
        </div>
      </div>

      {/* Task Title */}
      <h4
        style={{
          fontSize: '0.925rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          lineHeight: 1.35,
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}
      >
        {task.title}
      </h4>

      {/* Optional Description snippet */}
      {task.description && (
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {task.description}
        </p>
      )}

      {/* Bottom Footer: Due Date & Assignee */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '4px',
          paddingTop: '8px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)'
        }}
      >
        {/* Due Date Indicator */}
        {dueInfo ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: dueInfo.isOverdue
                ? '#f87171'
                : dueInfo.isToday
                ? '#fbbf24'
                : 'var(--text-muted)'
            }}
          >
            <Calendar size={13} />
            {dueInfo.text}
          </span>
        ) : (
          <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>No due date</span>
        )}

        {/* Assignee Avatar */}
        {task.assignee_name ? (
          <UserAvatar
            name={task.assignee_name}
            avatarUrl={task.assignee_avatar}
            size={24}
          />
        ) : (
          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              border: '1px dashed var(--border-subtle)'
            }}
          >
            Unassigned
          </span>
        )}
      </div>
    </div>
  );
}
