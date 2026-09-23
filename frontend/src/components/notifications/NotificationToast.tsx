import {
  Bell,
  CheckCircle2,
  Clock,
  MessageSquare,
  UserPlus,
  X
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext.js';
import { NotificationType } from '../../types/notification.js';

interface NotificationToastProps {
  onNotificationClick?: (taskId: number) => void;
}

export function NotificationToast({ onNotificationClick }: NotificationToastProps) {
  const { activeToast, dismissToast, markAsRead } = useNotifications();

  if (!activeToast) return null;

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'TASK_ASSIGNED':
        return <UserPlus size={18} color="#60a5fa" />;
      case 'TASK_COMPLETED':
        return <CheckCircle2 size={18} color="#34d399" />;
      case 'DEADLINE_REMINDER':
        return <Clock size={18} color="#fbbf24" />;
      case 'TASK_COMMENT_ADDED':
        return <MessageSquare size={18} color="#a78bfa" />;
      case 'TASK_STATUS_CHANGED':
      default:
        return <Bell size={18} color="#818cf8" />;
    }
  };

  const handleClick = () => {
    markAsRead(activeToast.id);
    if (activeToast.entity_type === 'TASK' && activeToast.entity_id && onNotificationClick) {
      onNotificationClick(activeToast.entity_id);
    }
    dismissToast();
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: '72px',
        right: '24px',
        maxWidth: '380px',
        backgroundColor: 'rgba(23, 32, 54, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-focus)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-glow), var(--shadow-lg)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        zIndex: 200,
        cursor: 'pointer',
        animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

      <div
        style={{
          padding: '8px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {getIcon(activeToast.type)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.25
            }}
          >
            {activeToast.title}
          </h4>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Just now</span>
        </div>

        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            margin: '4px 0 0',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {activeToast.message}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          dismissToast();
        }}
        style={{
          background: 'transparent',
          color: 'var(--text-muted)',
          padding: '2px',
          borderRadius: 'var(--radius-sm)'
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
      >
        <X size={16} />
      </button>
    </div>
  );
}
