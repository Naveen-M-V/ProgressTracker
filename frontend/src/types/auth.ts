export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'TEAM_MEMBER';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface DemoAccount {
  name: string;
  email: string;
  role: UserRole;
  defaultPasswordHint: string;
}
