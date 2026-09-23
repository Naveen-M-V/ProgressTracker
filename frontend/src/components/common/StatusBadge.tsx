import { TaskStatus } from '../../types/task.js';

interface StatusBadgeProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'TODO':
        return {
          label: 'To Do',
          dot: '#94a3b8',
          className: 'badge-todo'
        };
      case 'IN_PROGRESS':
        return {
          label: 'In Progress',
          dot: '#60a5fa',
          className: 'badge-in-progress'
        };
      case 'REVIEW':
        return {
          label: 'In Review',
          dot: '#fbbf24',
          className: 'badge-review'
        };
      case 'BLOCKED':
        return {
          label: 'Blocked',
          dot: '#f87171',
          className: 'badge-blocked'
        };
      case 'COMPLETED':
        return {
          label: 'Completed',
          dot: '#34d399',
          className: 'badge-completed'
        };
      default:
        return {
          label: status,
          dot: '#94a3b8',
          className: 'badge-todo'
        };
    }
  };

  const config = getStatusConfig();
  const fontSize = size === 'sm' ? '0.725rem' : '0.825rem';
  const padding = size === 'sm' ? '3px 10px' : '5px 12px';

  return (
    <span
      className={`badge ${config.className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding,
        fontSize,
        fontWeight: 600,
        borderRadius: 'var(--radius-full)'
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: config.dot
        }}
      />
      {config.label}
    </span>
  );
}
