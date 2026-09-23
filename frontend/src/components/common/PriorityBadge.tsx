import { AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { TaskPriority } from '../../types/task.js';

interface PriorityBadgeProps {
  priority: TaskPriority;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function PriorityBadge({ priority, showIcon = true, size = 'sm' }: PriorityBadgeProps) {
  const getPriorityConfig = () => {
    switch (priority) {
      case 'URGENT':
        return {
          label: 'Urgent',
          bg: 'rgba(239, 68, 68, 0.15)',
          color: '#f87171',
          border: 'rgba(239, 68, 68, 0.35)',
          icon: <AlertCircle size={size === 'sm' ? 12 : 14} />
        };
      case 'HIGH':
        return {
          label: 'High',
          bg: 'rgba(249, 115, 22, 0.15)',
          color: '#fb923c',
          border: 'rgba(249, 115, 22, 0.35)',
          icon: <ArrowUp size={size === 'sm' ? 12 : 14} />
        };
      case 'MEDIUM':
        return {
          label: 'Medium',
          bg: 'rgba(59, 130, 246, 0.15)',
          color: '#60a5fa',
          border: 'rgba(59, 130, 246, 0.35)',
          icon: <ArrowDown size={size === 'sm' ? 12 : 14} />
        };
      case 'LOW':
      default:
        return {
          label: 'Low',
          bg: 'rgba(100, 116, 139, 0.15)',
          color: '#94a3b8',
          border: 'rgba(100, 116, 139, 0.35)',
          icon: <ArrowDown size={size === 'sm' ? 12 : 14} />
        };
    }
  };

  const config = getPriorityConfig();
  const fontSize = size === 'sm' ? '0.7rem' : '0.8rem';
  const padding = size === 'sm' ? '2px 8px' : '4px 10px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding,
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        borderRadius: 'var(--radius-full)',
        fontSize,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        lineHeight: 1
      }}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
}
