interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  showName?: boolean;
}

export function UserAvatar({ name, avatarUrl, size = 26, showName = false }: UserAvatarProps) {
  const getInitials = (n: string) => {
    if (!n) return '?';
    const parts = n.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  };

  const getBackgroundColor = (n: string) => {
    const colors = [
      '#4f46e5',
      '#2563eb',
      '#0d9488',
      '#d97706',
      '#7c3aed',
      '#db2777',
      '#059669',
      '#e11d48'
    ];
    let hash = 0;
    for (let i = 0; i < n.length; i++) {
      hash = n.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '1px solid var(--border-glass)'
          }}
        />
      ) : (
        <div
          title={name}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            backgroundColor: getBackgroundColor(name),
            color: '#ffffff',
            fontSize: `${Math.max(10, Math.floor(size * 0.42))}px`,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            flexShrink: 0
          }}
        >
          {getInitials(name)}
        </div>
      )}
      {showName && (
        <span
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-primary)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
