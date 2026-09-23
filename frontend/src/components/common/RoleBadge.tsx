import { Shield, Briefcase, User as UserIcon } from 'lucide-react';
import { UserRole } from '../../types/auth.js';

interface RoleBadgeProps {
  role: UserRole;
  size?: 'sm' | 'md';
}

export function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  const isSm = size === 'sm';
  const padding = isSm ? '2px 8px' : '4px 12px';
  const fontSize = isSm ? '0.7rem' : '0.75rem';
  const iconSize = isSm ? 12 : 14;

  if (role === 'ADMIN') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding,
          fontSize,
          fontWeight: 700,
          borderRadius: 'var(--radius-full)',
          background: 'rgba(168, 85, 247, 0.15)',
          color: '#c084fc',
          border: '1px solid rgba(168, 85, 247, 0.4)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        <Shield size={iconSize} color="#c084fc" />
        Admin
      </span>
    );
  }

  if (role === 'PROJECT_MANAGER') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding,
          fontSize,
          fontWeight: 700,
          borderRadius: 'var(--radius-full)',
          background: 'rgba(245, 158, 11, 0.15)',
          color: '#fbbf24',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        <Briefcase size={iconSize} color="#fbbf24" />
        Project Manager
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding,
        fontSize,
        fontWeight: 700,
        borderRadius: 'var(--radius-full)',
        background: 'rgba(59, 130, 246, 0.15)',
        color: '#60a5fa',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      <UserIcon size={iconSize} color="#60a5fa" />
      Team Member
    </span>
  );
}
