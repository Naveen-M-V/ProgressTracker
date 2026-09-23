export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'TEAM_MEMBER';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export interface UserWithPassword extends User {
  password_hash: string;
}

export interface AuthTokenPayload {
  userId: number;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  user: User;
  token: string;
}

export interface SignupDTO {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  avatar_url?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}
