import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, DemoAccount } from '../types/auth.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string, role?: string) => Promise<boolean>;
  logout: () => void;
  quickLoginDemo: (email: string, password: string) => Promise<boolean>;
  clearError: () => void;
  demoAccounts: DemoAccount[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'upsow_auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  // Fetch demo accounts for development testing
  useEffect(() => {
    fetch('/api/auth/demo-accounts')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDemoAccounts(data.data);
        }
      })
      .catch(() => {
        // Fallback default demo list if server is offline
        setDemoAccounts([
          { name: 'Admin', email: 'admin@upsow.com', role: 'ADMIN', defaultPasswordHint: 'Admin@123' },
          { name: 'Project Manager', email: 'pm@upsow.com', role: 'PROJECT_MANAGER', defaultPasswordHint: 'Manager@123' },
          { name: 'Developer', email: 'developer@upsow.com', role: 'TEAM_MEMBER', defaultPasswordHint: 'Developer@123' },
          { name: 'Operations Head', email: 'operationhead@upsow.com', role: 'TEAM_MEMBER', defaultPasswordHint: 'Operations@123' },
          { name: 'Designer', email: 'design@upsow.com', role: 'TEAM_MEMBER', defaultPasswordHint: 'Designer@123' }
        ]);
      });
  }, []);

  // Check persistent token on load
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${storedToken}`
      }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Token expired or invalid');
        }
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          setUser(data.data);
          setToken(storedToken);
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setUser(null);
          setToken(null);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Login failed. Please check your credentials.');
        return false;
      }

      const receivedToken = data.data.token;
      const receivedUser = data.data.user;

      localStorage.setItem(TOKEN_KEY, receivedToken);
      setToken(receivedToken);
      setUser(receivedUser);
      return true;
    } catch (err: any) {
      setError(err.message || 'Cannot reach the authentication server');
      return false;
    }
  };

  const signup = async (name: string, email: string, password: string, role = 'TEAM_MEMBER'): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Registration failed.');
        return false;
      }

      const receivedToken = data.data.token;
      const receivedUser = data.data.user;

      localStorage.setItem(TOKEN_KEY, receivedToken);
      setToken(receivedToken);
      setUser(receivedUser);
      return true;
    } catch (err: any) {
      setError(err.message || 'Cannot reach the authentication server');
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
    setError(null);
  };

  const quickLoginDemo = async (email: string, password: string): Promise<boolean> => {
    return login(email, password);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        error,
        login,
        signup,
        logout,
        quickLoginDemo,
        clearError,
        demoAccounts
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
