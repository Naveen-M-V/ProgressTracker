import { useState } from 'react';
import { LogOut, ChevronDown, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { RoleBadge } from '../common/RoleBadge.js';
import { NotificationCenter } from '../notifications/NotificationCenter.js';
import { TaskItUpLogo } from '../common/TaskItUpLogo.js';

interface HeaderProps {
  onOpenTask?: (taskId: number) => void;
}

export function Header({ onOpenTask }: HeaderProps) {
  const { user, logout, quickLoginDemo, demoAccounts } = useAuth();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleSwitch = async (email: string, hint: string) => {
    setSwitching(true);
    await quickLoginDemo(email, hint);
    setSwitching(false);
    setShowRoleSwitcher(false);
  };

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-glass)',
        backdropFilter: 'var(--backdrop-blur)',
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Brand */}
      <TaskItUpLogo variant="horizontal" size={38} />

      {/* User Info & Role Switcher */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Quick Demo Impersonation Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
              className="btn-secondary"
              style={{
                fontSize: '0.8rem',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderColor: showRoleSwitcher ? 'var(--brand-secondary)' : 'var(--border-subtle)',
              }}
              title="Quickly switch demo users to evaluate role-based access"
            >
              <UserCheck size={14} color="#38bdf8" />
              <span>Switch Role</span>
              <ChevronDown size={14} />
            </button>

            {showRoleSwitcher && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '110%',
                  width: '260px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '8px',
                  zIndex: 100,
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    padding: '6px 8px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Test Role Perspectives
                </div>
                {demoAccounts.map((account) => {
                  const isCurrent = user.email === account.email;
                  return (
                    <button
                      key={account.email}
                      disabled={switching || isCurrent}
                      onClick={() => handleSwitch(account.email, account.defaultPasswordHint)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: isCurrent ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                        color: isCurrent ? '#93c5fd' : 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.85rem',
                        cursor: isCurrent ? 'default' : 'pointer',
                        opacity: switching ? 0.6 : 1,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{account.name}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{account.role}</div>
                      </div>
                      {isCurrent && (
                        <span style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 600 }}>ACTIVE</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* User Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <img
              src={user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(user.name)}`}
              alt={user.name}
              style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border-subtle)' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 600, fontSize: '0.825rem', color: 'var(--text-primary)' }}>{user.name}</span>
            </div>
            <RoleBadge role={user.role} size="sm" />
          </div>

          {/* Notification Center */}
          <NotificationCenter onOpenTask={onOpenTask} />

          {/* Logout Button */}
          <button
            onClick={logout}
            className="btn-secondary"
            style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}
            title="Log out of session"
          >
            <LogOut size={16} />
            <span style={{ fontSize: '0.8rem' }}>Logout</span>
          </button>
        </div>
      )}
    </header>
  );
}
