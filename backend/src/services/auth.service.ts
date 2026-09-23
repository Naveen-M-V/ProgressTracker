import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { User, UserRole, AuthResult, SignupDTO, LoginDTO, AuthTokenPayload } from '../types/auth.js';

export class AuthService {
  private static getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    return secret;
  }

  private static sanitizeUser(row: any): User {
    const { password_hash, ...user } = row;
    return user as User;
  }

  /**
   * Issue a signed JWT token
   */
  public static generateToken(user: User): string {
    const payload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    return jwt.sign(payload, this.getJwtSecret(), {
      expiresIn: '7d'
    });
  }

  /**
   * Verify and decode a JWT token
   */
  public static verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, this.getJwtSecret()) as AuthTokenPayload;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('AUTH_TOKEN_EXPIRED');
      }
      throw new Error('AUTH_TOKEN_INVALID');
    }
  }

  /**
   * Register a new user with bcrypt password hashing and atomic insertion
   */
  public static signup(dto: SignupDTO): AuthResult {
    // 1. Validate inputs
    const trimmedEmail = dto.email?.trim().toLowerCase();
    const trimmedName = dto.name?.trim();

    if (!trimmedName || trimmedName.length < 2) {
      const err = new Error('Name must be at least 2 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      const err = new Error('A valid email address is required');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    if (!dto.password || dto.password.length < 6) {
      const err = new Error('Password must be at least 6 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const validRoles: UserRole[] = ['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER'];
    const role: UserRole = dto.role && validRoles.includes(dto.role) ? dto.role : 'TEAM_MEMBER';

    // 2. Check for duplicate email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
    if (existing) {
      const err = new Error('An account with this email address already exists');
      (err as any).code = 'CONFLICT';
      throw err;
    }

    // 3. Hash password securely with bcrypt
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(dto.password, salt);
    const avatarUrl = dto.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(trimmedName)}`;

    // 4. Perform atomic insertion in SQLite transaction
    const insertTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(trimmedName, trimmedEmail, passwordHash, role, avatarUrl);
      return result.lastInsertRowid;
    });

    const newUserId = insertTx();

    // 5. Fetch newly created user and sanitize
    const createdRow = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId);
    const user = this.sanitizeUser(createdRow);

    // 6. Issue JWT
    const token = this.generateToken(user);

    return { user, token };
  }

  /**
   * Authenticate an existing user by email and password
   */
  public static login(dto: LoginDTO): AuthResult {
    const trimmedEmail = dto.email?.trim().toLowerCase();

    if (!trimmedEmail || !dto.password) {
      const err = new Error('Email and password are required');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    // 1. Look up user by email
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(trimmedEmail) as any;
    if (!userRow) {
      const err = new Error('Invalid email or password');
      (err as any).code = 'AUTH_REQUIRED';
      throw err;
    }

    // 2. Verify password with bcrypt
    const isMatch = bcrypt.compareSync(dto.password, userRow.password_hash);
    if (!isMatch) {
      const err = new Error('Invalid email or password');
      (err as any).code = 'AUTH_REQUIRED';
      throw err;
    }

    // 3. Sanitize user and issue JWT
    const user = this.sanitizeUser(userRow);
    const token = this.generateToken(user);

    return { user, token };
  }

  /**
   * Get user profile by ID without password hash
   */
  public static getProfile(userId: number): User {
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!userRow) {
      const err = new Error('User not found');
      (err as any).code = 'USER_NOT_FOUND';
      throw err;
    }

    return this.sanitizeUser(userRow);
  }

  /**
   * Return generic demo accounts for quick testing in development
   */
  public static getDemoAccounts(): Array<{ name: string; email: string; role: UserRole; defaultPasswordHint: string }> {
    return [
      { name: 'Admin', email: 'admin@upsow.com', role: 'ADMIN', defaultPasswordHint: 'Admin@123' },
      { name: 'Project Manager', email: 'pm@upsow.com', role: 'PROJECT_MANAGER', defaultPasswordHint: 'Manager@123' },
      { name: 'Developer', email: 'developer@upsow.com', role: 'TEAM_MEMBER', defaultPasswordHint: 'Developer@123' },
      { name: 'Operations Head', email: 'operationhead@upsow.com', role: 'TEAM_MEMBER', defaultPasswordHint: 'Operations@123' },
      { name: 'Designer', email: 'design@upsow.com', role: 'TEAM_MEMBER', defaultPasswordHint: 'Designer@123' }
    ];
  }

  /**
   * Return list of all users without sensitive fields
   */
  public static getAllUsers(): User[] {
    const rows = db.prepare('SELECT id, name, email, role, avatar_url, created_at FROM users ORDER BY name ASC').all() as any[];
    return rows;
  }
}
