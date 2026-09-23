import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, Briefcase, Code, Cpu, Palette } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

interface LoginPageProps {
  onSwitchToSignup: () => void;
}

export function LoginPage({ onSwitchToSignup }: LoginPageProps) {
  const { login, quickLoginDemo, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await login(email, password);
    setSubmitting(false);
  };

  const handleDemoClick = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setSubmitting(true);
    await quickLoginDemo(demoEmail, demoPassword);
    setSubmitting(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--bg-primary)',
        backgroundImage: 'radial-gradient(ellipse at 50% 10%, rgba(79, 70, 229, 0.15) 0%, transparent 60%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Logo and Intro */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--brand-gradient)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
              marginBottom: '16px',
            }}
          >
            <Lock size={24} color="#ffffff" />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '6px' }}>Sign in to Upsow</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Internal Team Task-Management & Collaboration
          </p>
        </div>

        {/* Login Card */}
        <div className="card-glass" style={{ padding: '32px' }}>
          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.85rem',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{error}</span>
              <button
                onClick={clearError}
                style={{ background: 'transparent', color: '#fca5a5', fontSize: '1.1rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Work Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '12px' }} />
                <input
                  type="email"
                  required
                  placeholder="name@upsow.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 40px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    transition: 'border-color var(--transition-fast)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--brand-secondary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '12px' }} />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 40px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    transition: 'border-color var(--transition-fast)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--brand-secondary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '11px',
                marginTop: '8px',
                fontSize: '0.925rem',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Authenticating...' : 'Sign In to Workspace'}
              <ArrowRight size={16} />
            </button>
          </form>

          {/* Quick Demo Impersonation Buttons */}
          <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', textAlign: 'center' }}>
              Instant Demo Access (Click to test roles)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleDemoClick('admin@upsow.com', 'Admin@123')}
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '8px 10px', justifyContent: 'flex-start' }}
              >
                <ShieldCheck size={14} color="#c084fc" />
                <span>Admin</span>
              </button>

              <button
                type="button"
                onClick={() => handleDemoClick('pm@upsow.com', 'Manager@123')}
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '8px 10px', justifyContent: 'flex-start' }}
              >
                <Briefcase size={14} color="#fbbf24" />
                <span>Project Manager</span>
              </button>

              <button
                type="button"
                onClick={() => handleDemoClick('developer@upsow.com', 'Developer@123')}
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '8px 10px', justifyContent: 'flex-start' }}
              >
                <Code size={14} color="#60a5fa" />
                <span>Developer</span>
              </button>

              <button
                type="button"
                onClick={() => handleDemoClick('operationhead@upsow.com', 'Operations@123')}
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '8px 10px', justifyContent: 'flex-start' }}
              >
                <Cpu size={14} color="#34d399" />
                <span>Operations</span>
              </button>
            </div>

            <div style={{ marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => handleDemoClick('design@upsow.com', 'Designer@123')}
                className="btn-secondary"
                style={{ width: '100%', fontSize: '0.75rem', padding: '8px 10px', justifyContent: 'center' }}
              >
                <Palette size={14} color="#f472b6" />
                <span>Designer (design@upsow.com)</span>
              </button>
            </div>
          </div>

          {/* Toggle to Signup */}
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Don't have an account? </span>
            <button
              onClick={onSwitchToSignup}
              style={{ background: 'transparent', color: 'var(--brand-secondary)', fontWeight: 600, padding: 0, textDecoration: 'underline' }}
            >
              Sign up here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
