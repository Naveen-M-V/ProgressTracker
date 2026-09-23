import { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  MessageSquare,
  UserPlus,
  Trash2,
  X,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext.js';
import { Notification, NotificationType } from '../../types/notification.js';
import { UserAvatar } from '../common/UserAvatar.js';

interface NotificationCenterProps {
  onOpenTask?: (taskId: number) => void;
}

export function NotificationCenter({ onOpenTask }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    isOpen,
    setIsOpen,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    runDeadlineCheck
  } = useNotifications();

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread'>('all');
  const [isScanningDeadlines, setIsScanningDeadlines] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, setIsOpen]);

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'unread') return !n.is_read;
    return true;
  });

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'TASK_ASSIGNED':
        return <UserPlus size={16} color="#60a5fa" />;
      case 'TASK_COMPLETED':
        return <CheckCircle2 size={16} color="#34d399" />;
      case 'DEADLINE_REMINDER':
        return <Clock size={16} color="#fbbf24" />;
      case 'TASK_COMMENT_ADDED':
        return <MessageSquare size={16} color="#a78bfa" />;
      case 'TASK_STATUS_CHANGED':
      default:
        return <Bell size={16} color="#818cf8" />;
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    const diffDays = Math.floor(diffSec / 86400);
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.is_read) {
      markAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.entity_type === 'TASK' && notif.entity_id && onOpenTask) {
      onOpenTask(notif.entity_id);
    }
  };

  const handleTriggerDeadlines = async () => {
    setIsScanningDeadlines(true);
    setScanMessage(null);
    try {
      const created = await runDeadlineCheck();
      setScanMessage(
        created > 0
          ? `Scanned: Generated ${created} deadline reminder(s)`
          : 'Scanned: All deadlines are up to date (no new alerts)'
      );
      setTimeout(() => setScanMessage(null), 4000);
    } finally {
      setIsScanningDeadlines(false);
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
        style={{
          position: 'relative',
          background: isOpen ? 'rgba(79, 70, 229, 0.2)' : 'var(--bg-tertiary)',
          border: isOpen ? '1px solid var(--brand-secondary)' : '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 10px',
          color: isOpen ? '#ffffff' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all var(--transition-fast)'
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => {
          if (!isOpen) (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
        }}
      >
        <Bell size={18} />

        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              minWidth: '18px',
              height: '18px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontSize: '0.675rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.6)',
              animation: 'pulse 2s infinite'
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="card-glass"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: '400px',
            maxHeight: '520px',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 150,
            border: '1px solid var(--border-glass)',
            boxShadow: 'var(--shadow-lg), var(--shadow-glow)',
            animation: 'fadeInScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            overflow: 'hidden'
          }}
        >
          <style>{`
            @keyframes fadeInScale {
              from {
                opacity: 0;
                transform: translateY(-8px) scale(0.98);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
          `}</style>

          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'linear-gradient(180deg, rgba(30, 41, 69, 0.5) 0%, rgba(17, 24, 39, 0.3) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Notifications</h3>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: 'rgba(79, 70, 229, 0.25)',
                    color: '#818cf8',
                    border: '1px solid rgba(79, 70, 229, 0.4)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Scan Deadlines Button */}
              <button
                onClick={handleTriggerDeadlines}
                disabled={isScanningDeadlines}
                title="Scan for upcoming & overdue deadlines"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '5px 8px',
                  color: isScanningDeadlines ? 'var(--brand-secondary)' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: isScanningDeadlines ? 'default' : 'pointer'
                }}
              >
                <RefreshCw size={13} style={{ animation: isScanningDeadlines ? 'spin 1s linear infinite' : 'none' }} />
                <span>Check Deadlines</span>
              </button>

              {/* Mark All Read */}
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  title="Mark all as read"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--brand-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 6px'
                  }}
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}

              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  padding: '4px'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Feedback banner for deadline scan */}
          {scanMessage && (
            <div
              style={{
                padding: '8px 16px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#93c5fd',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={14} />
              {scanMessage}
            </div>
          )}

          {/* Filter Tabs */}
          <div
            style={{
              display: 'flex',
              padding: '8px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'rgba(11, 15, 25, 0.4)',
              gap: '12px'
            }}
          >
            <button
              onClick={() => setActiveFilter('all')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeFilter === 'all' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: activeFilter === 'all' ? 700 : 500,
                fontSize: '0.8rem',
                padding: '4px 2px',
                borderBottom: activeFilter === 'all' ? '2px solid var(--brand-secondary)' : '2px solid transparent'
              }}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setActiveFilter('unread')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeFilter === 'unread' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: activeFilter === 'unread' ? 700 : 500,
                fontSize: '0.8rem',
                padding: '4px 2px',
                borderBottom: activeFilter === 'unread' ? '2px solid var(--brand-secondary)' : '2px solid transparent'
              }}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications Scroll Area */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              maxHeight: '380px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {filteredNotifications.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  color: 'var(--text-muted)'
                }}
              >
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Bell size={20} color="var(--text-muted)" />
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>
                  {activeFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Updates and deadline alerts will appear here.
                </span>
              </div>
            ) : (
              filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    backgroundColor: !n.is_read ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    cursor: 'pointer',
                    transition: 'background var(--transition-fast)',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)')}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = !n.is_read
                      ? 'rgba(79, 70, 229, 0.08)'
                      : 'transparent';
                  }}
                >
                  {/* Unread Glow Dot */}
                  {!n.is_read && (
                    <span
                      style={{
                        position: 'absolute',
                        left: '8px',
                        top: '18px',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--brand-secondary)',
                        boxShadow: '0 0 6px var(--brand-secondary)'
                      }}
                    />
                  )}

                  {/* Icon or Avatar */}
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
                    {n.actor_name ? (
                      <UserAvatar name={n.actor_name} avatarUrl={n.actor_avatar} size={22} />
                    ) : (
                      getIcon(n.type)
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                      <h4
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: !n.is_read ? 700 : 600,
                          color: 'var(--text-primary)',
                          margin: 0,
                          lineHeight: 1.3
                        }}
                      >
                        {n.title}
                      </h4>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>

                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        margin: '4px 0 0',
                        lineHeight: 1.35
                      }}
                    >
                      {n.message}
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(n.id);
                    }}
                    title="Delete notification"
                    style={{
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      padding: '4px',
                      borderRadius: 'var(--radius-sm)',
                      opacity: 0.6
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = '1';
                      (e.currentTarget as HTMLElement).style.color = '#f87171';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = '0.6';
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
