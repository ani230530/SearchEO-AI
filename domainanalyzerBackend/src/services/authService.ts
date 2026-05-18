import { PrismaClient } from '../../generated/prisma';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; 
const REFRESH_TOKEN_EXPIRES_IN = '7d';
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
  user?: {
    id: number;
    email: string;
    name?: string;
  };
  token?: string;
  refreshToken?: string;
  message?: string;
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
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Create user (unverified)
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        emailVerified: true, // Auto-verify
        emailVerificationToken: null, // No token needed
        emailVerificationTokenExpiry: null
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    // Generate tokens for auto-login
    const token = this.generateToken(user.id, user.email);
    const refreshToken = this.generateRefreshToken(user.id, user.email);
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store refresh token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken,
        refreshTokenExpiry
      }
    });

    // Send verification email (Optional - skipping for now as per request)
    // try {
    //   await this.sendVerificationEmail(user.email, verificationToken, user.name || undefined);
    // } catch (err) {
    //   console.error('Failed to send verification email:', err);
    // }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name === null ? undefined : user.name
      },
      token,
      refreshToken,
      message: 'Registration successful.'
    };
  }

  // Login user
  async login(loginData: UserLoginData): Promise<AuthResponse> {
    const { email, password } = loginData;
    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
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

  // Verify email using token
  async verifyEmailToken(token: string): Promise<{ success: boolean }> {
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token
      }
    });
    if (!user) {
      throw new Error('Invalid verification token');
    }
    if (user.emailVerificationTokenExpiry && user.emailVerificationTokenExpiry < new Date()) {
      throw new Error('Verification token expired');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiry: null
      }
    });
    return { success: true };
  }

  private resendRateLimit = new Map<string, number>();

  // Resend verification email
  async resendVerificationEmail(email: string): Promise<{ success: boolean }> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();
    const last = this.resendRateLimit.get(normalizedEmail) || 0;
    if (now - last < 60_000) {
      return { success: true };
    }
    this.resendRateLimit.set(normalizedEmail, now);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return { success: true };
    }
    if (user.emailVerified) {
      return { success: true };
    }
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiry: verificationTokenExpiry
      }
    });
    await this.sendVerificationEmail(user.email, verificationToken, user.name || undefined);
    return { success: true };
  }

  // Send verification email
  private async sendVerificationEmail(email: string, token: string, name?: string) {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;
    if (!gmailUser || !gmailPass) {
      throw new Error('GMAIL_USER and GMAIL_PASS must be set');
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });
    const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`;
    const verifyUrl = `${backendUrl}/api/auth/verify-email?token=${token}`;
    const from = process.env.EMAIL_FROM || gmailUser;
    await transporter.sendMail({
      from,
      to: email,
      subject: 'Verify your email',
      html: `
        <div style="font-family: Arial, sans-serif; font-size: 16px;">
          <p>${name ? `Hi ${name},` : 'Hi,'}</p>
          <p>Thanks for signing up. Please confirm your email address by clicking the button below:</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Confirm Email</a></p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>This link expires in 24 hours.</p>
        </div>
      `
    });
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
            host: true,
            createdAt: true,
            _count: {
              select: {
                keywords: true,
                crawls: true,
              },
            },
          },
        },
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

  // Google login - look up or create a shadow-password user
  async loginOrCreateWithGoogleEmail(email: string, name?: string | null): Promise<AuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      // Create a password-less user for Google
      const saltRounds = 12;
      const placeholderPassword = await bcrypt.hash('__google_auth_no_password__' + Math.random(), saltRounds);
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          password: placeholderPassword,
          name: name ?? undefined,
          emailVerified: true,
        }
      });
    }

    const token = this.generateToken(user.id, user.email);
    const refreshToken = this.generateRefreshToken(user.id, user.email);
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken, refreshTokenExpiry }
    });

    return {
      user: { id: user.id, email: user.email, name: user.name ?? undefined },
      token,
      refreshToken
    };
  }
}

export const authService = new AuthService(); 
