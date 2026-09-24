import React from 'react';

interface TaskItUpLogoProps {
  size?: number | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'icon' | 'full' | 'horizontal';
  showText?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function TaskItUpLogo({
  size = 'md',
  variant = 'icon',
  showText = true,
  className = '',
  style = {}
}: TaskItUpLogoProps) {
  // Compute pixel dimensions based on preset
  let pixelSize = 36;
  if (typeof size === 'number') {
    pixelSize = size;
  } else {
    switch (size) {
      case 'sm':
        pixelSize = 28;
        break;
      case 'md':
        pixelSize = 38;
        break;
      case 'lg':
        pixelSize = 56;
        break;
      case 'xl':
        pixelSize = 96;
        break;
    }
  }

  // Full logo display (ideal for login, signup, landing)
  if (variant === 'full') {
    return (
      <div
        className={`taskitup-logo-full ${className}`}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          ...style
        }}
      >
        <div
          style={{
            width: `${pixelSize}px`,
            height: `${pixelSize}px`,
            borderRadius: `${Math.round(pixelSize * 0.22)}px`,
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${Math.round(pixelSize * 0.08)}px`,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35), 0 0 20px rgba(37, 99, 235, 0.25)',
            border: '2px solid rgba(255, 255, 255, 0.9)',
            overflow: 'hidden',
            transition: 'transform var(--transition-normal), box-shadow var(--transition-normal)'
          }}
        >
          <img
            src="/TaskItUpLogo.jpeg"
            alt="TaskItUp Logo"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
        </div>
      </div>
    );
  }

  // Horizontal variant (logo + text side by side)
  if (variant === 'horizontal') {
    return (
      <div
        className={`taskitup-brand-horizontal ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          userSelect: 'none',
          ...style
        }}
      >
        <div
          style={{
            width: `${pixelSize}px`,
            height: `${pixelSize}px`,
            borderRadius: `${Math.round(pixelSize * 0.24)}px`,
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${Math.max(2, Math.round(pixelSize * 0.06))}px`,
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25), 0 0 12px rgba(37, 99, 235, 0.2)',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            overflow: 'hidden',
            flexShrink: 0
          }}
        >
          <img
            src="/TaskItUpLogo.jpeg"
            alt="TaskItUp Logo"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
        </div>

        {showText && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: `${Math.max(16, Math.round(pixelSize * 0.48))}px`,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                display: 'flex',
                alignItems: 'center',
                gap: '1px'
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>Task</span>
              <span style={{ color: 'var(--brand-primary)', fontWeight: 800 }}>ItUp</span>
            </span>
            <span
              style={{
                fontSize: '0.725rem',
                color: 'var(--text-muted)',
                fontWeight: 500,
                letterSpacing: '0.01em',
                marginTop: '2px'
              }}
            >
              Workspace &amp; Project Tracker
            </span>
          </div>
        )}
      </div>
    );
  }

  // Icon only
  return (
    <div
      className={`taskitup-logo-icon ${className}`}
      style={{
        width: `${pixelSize}px`,
        height: `${pixelSize}px`,
        borderRadius: `${Math.round(pixelSize * 0.24)}px`,
        backgroundColor: '#ffffff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${Math.max(2, Math.round(pixelSize * 0.06))}px`,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25), 0 0 10px rgba(37, 99, 235, 0.2)',
        border: '1.5px solid rgba(255, 255, 255, 0.85)',
        overflow: 'hidden',
        flexShrink: 0,
        ...style
      }}
    >
      <img
        src="/TaskItUpLogo.jpeg"
        alt="TaskItUp Logo"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
