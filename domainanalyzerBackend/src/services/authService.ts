import { PrismaClient } from '../../generated/prisma';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = '30m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // Long-lived refresh token
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + '-refresh';

export interface UserRegistrationData {
  email: string;
  password: string;
  name?: string;
}

export interface UserLoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: number;
    email: string;
    name?: string;
  };
  token: string;
  refreshToken: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: number;
  email: string;
  tokenVersion: number;
}

export class AuthService {
  // Register a new user
  async register(userData: UserRegistrationData): Promise<AuthResponse> {
    const { email, password, name } = userData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    // Generate tokens
    const token = this.generateToken(user.id, user.email);
    const refreshToken = this.generateRefreshToken(user.id, user.email);
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken,
        refreshTokenExpiry
      }
    });

    return {
      user: {
        ...user,
        name: user.name === null ? undefined : user.name
      },
      token,
      refreshToken
    };
  }

  // Login user
  async login(loginData: UserLoginData): Promise<AuthResponse> {
    const { email, password } = loginData;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const token = this.generateToken(user.id, user.email);
    const refreshToken = this.generateRefreshToken(user.id, user.email);
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken,
        refreshTokenExpiry
      }
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name === null ? undefined : user.name
      },
      token,
      refreshToken
    };
  }

  // Verify JWT token
  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      // Check if user still exists
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      throw new Error('Invalid token');
    }
  }

  // Verify refresh token
  async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as RefreshTokenPayload;
      
      // Check if user exists and refresh token matches
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.refreshToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      // Check if refresh token is expired
      if (user.refreshTokenExpiry && user.refreshTokenExpiry < new Date()) {
        throw new Error('Refresh token expired');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      }
      throw new Error('Invalid refresh token');
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken: string): Promise<AuthResponse> {
    const decoded = await this.verifyRefreshToken(refreshToken);
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Generate new access token
    const token = this.generateToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name === null ? undefined : user.name
      },
      token,
      refreshToken // Return same refresh token
    };
  }

  // Get user by ID
  async getUserById(userId: number) {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        domains: {
          select: {
            id: true,
            url: true,
            context: true,
            createdAt: true,
            _count: {
              select: {
                keywords: true,
                crawlResults: true
              }
            }
          }
        }
      }
    });
  }

  // Generate JWT access token
  private generateToken(userId: number, email: string): string {
    return jwt.sign(
      { userId, email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  // Generate refresh token
  private generateRefreshToken(userId: number, email: string): string {
    return jwt.sign(
      { userId, email, tokenVersion: 1 },
      REFRESH_TOKEN_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );
  }

  // Change password
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });
  }

  // Update user profile
  async updateProfile(userId: number, name?: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { name }
    });
  }

  // Invalidate refresh token (logout)
  async invalidateRefreshToken(userId: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExpiry: null
      }
    });
  }
}

export const authService = new AuthService(); 