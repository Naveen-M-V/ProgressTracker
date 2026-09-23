import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext.js';
import { Notification } from '../types/notification.js';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  isLoading: boolean;
  activeToast: Notification | null;
  setIsOpen: (open: boolean) => void;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  runDeadlineCheck: () => Promise<number>;
  dismissToast: () => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeToast, setActiveToast] = useState<Notification | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUnreadCount(data.data.count);
      }
    } catch (err) {
      console.error('Failed to load unread count', err);
    }
  }, [token]);

  const refreshNotifications = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [notifsRes, countRes] = await Promise.all([
        fetch('/api/notifications?limit=50', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/notifications/unread-count', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const notifsData = await notifsRes.json();
      const countData = await countRes.json();

      if (notifsData.success && Array.isArray(notifsData.data)) {
        setNotifications(notifsData.data);
      }
      if (countData.success) {
        setUnreadCount(countData.data.count);
      }
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshNotifications();
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [token, refreshNotifications]);

  // Real-time Socket.io Notification Listener
  useEffect(() => {
    if (!token || !user) return;

    const socket: Socket = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('notification:created', (newNotif: Notification) => {
      // Prepend to notifications list
      setNotifications((prev) => [newNotif, ...prev]);
      setUnreadCount((prev) => prev + 1);

      // Trigger floating live toast
      setActiveToast(newNotif);
    });

    socket.on('notification:read', ({ id }: { id: number }) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    });

    socket.on('notification:all_read', () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user]);

  // Auto-dismiss active toast after 6 seconds
  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeToast]);

  const dismissToast = () => setActiveToast(null);

  const markAsRead = async (id: number) => {
    if (!token) return;
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Error marking notification as read', err);
      fetchUnreadCount();
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;
    // Optimistic UI update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Error marking all notifications as read', err);
      refreshNotifications();
    }
  };

  const deleteNotification = async (id: number) => {
    if (!token) return;
    const target = notifications.find((n) => n.id === id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (target && !target.is_read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Error deleting notification', err);
      refreshNotifications();
    }
  };

  const runDeadlineCheck = async (): Promise<number> => {
    if (!token) return 0;
    try {
      const res = await fetch('/api/notifications/reminders/run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        await refreshNotifications();
        return data.data.remindersCreated;
      }
      return 0;
    } catch (err) {
      console.error('Failed to trigger deadline reminder scan', err);
      return 0;
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isOpen,
        isLoading,
        activeToast,
        setIsOpen,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        runDeadlineCheck,
        dismissToast,
        refreshNotifications
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
