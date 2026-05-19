import { PrismaClient } from '../../generated/prisma';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { authEnv } from '../config/authEnv';
import { sendMail } from './mailer';

const prisma = new PrismaClient();

// Tuneables.
const SALT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 32; // → 43-char base64url string
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15min
const RESEND_VERIFY_COOLDOWN_MS = 60_000;

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
    emailVerified: boolean;
  };
  token?: string;
  refreshToken?: string;
  message?: string;
}

// Payload baked into the access-token JWT. `tv` (tokenVersion) lets us
// invalidate every outstanding token for a user without a Redis blacklist —
// bumping User.tokenVersion makes existing JWTs fail their next request.
export interface JWTPayload {
  userId: number;
  email: string;
  tv: number;
  iat?: number;
  exp?: number;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function generateOpaqueToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function refreshTokenExpiryDate(): Date {
  return new Date(Date.now() + authEnv.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export interface RefreshContext {
  userAgent?: string | null;
  ip?: string | null;
}

export class AuthService {
  // ── Registration ─────────────────────────────────────────────────────────
  async register(userData: UserRegistrationData, ctx: RefreshContext = {}): Promise<AuthResponse> {
    const { email, password, name } = userData;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiry: verificationTokenExpiry,
        passwordChangedAt: new Date(),
      },
      select: { id: true, email: true, name: true, emailVerified: true, tokenVersion: true },
    });

    // Send verification email. Failures here don't block the signup —
    // the user can request a resend from the verify-pending page.
    try {
      await this.sendVerificationEmail(user.email, verificationToken, user.name || undefined);
    } catch (err) {
      console.error('[authService.register] sendVerificationEmail failed', err);
    }

    const accessToken = this.generateAccessToken(user.id, user.email, user.tokenVersion);
    const refreshToken = await this.issueRefreshToken(user.id, null, ctx);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        emailVerified: user.emailVerified,
      },
      token: accessToken,
      refreshToken,
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  // ── Login ────────────────────────────────────────────────────────────────
  async login(loginData: UserLoginData, ctx: RefreshContext = {}): Promise<AuthResponse> {
    const { email, password } = loginData;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.password) {
      // Generic message — never reveal whether the email exists.
      throw new Error('Invalid email or password');
    }

    // Lockout check before bcrypt to avoid timing leakage on locked accounts.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.recordFailedLogin(user.id, user.loginFailureCount);
      throw new Error('Invalid email or password');
    }

    // Successful login — clear counters, stamp lastLoginAt.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginFailureCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = this.generateAccessToken(user.id, user.email, user.tokenVersion);
    const refreshToken = await this.issueRefreshToken(user.id, null, ctx);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        emailVerified: user.emailVerified,
      },
      token: accessToken,
      refreshToken,
    };
  }

  private async recordFailedLogin(userId: number, currentCount: number): Promise<void> {
    const nextCount = currentCount + 1;
    if (nextCount >= LOCKOUT_THRESHOLD) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          loginFailureCount: 0,
          lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
        },
      });
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: { loginFailureCount: nextCount },
      });
    }
  }

  // ── Email verification ───────────────────────────────────────────────────
  async verifyEmailToken(token: string): Promise<{ success: boolean }> {
    const user = await prisma.user.findFirst({ where: { emailVerificationToken: token } });
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
        emailVerificationTokenExpiry: null,
      },
    });
    return { success: true };
  }

  private resendRateLimit = new Map<string, number>();

  async resendVerificationEmail(email: string): Promise<{ success: boolean }> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();
    const last = this.resendRateLimit.get(normalizedEmail) || 0;
    if (now - last < RESEND_VERIFY_COOLDOWN_MS) return { success: true };
    this.resendRateLimit.set(normalizedEmail, now);

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.emailVerified) return { success: true };

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(now + VERIFY_TOKEN_TTL_MS);
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: verificationToken, emailVerificationTokenExpiry: verificationTokenExpiry },
    });
    try {
      await this.sendVerificationEmail(user.email, verificationToken, user.name || undefined);
    } catch (err) {
      console.error('[authService.resendVerificationEmail] send failed', err);
    }
    return { success: true };
  }

  private async sendVerificationEmail(email: string, token: string, name?: string) {
    const verifyUrl = `${authEnv.BACKEND_PUBLIC_URL}/api/auth/verify-email?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Verify your email',
      text: `Hi${name ? ' ' + name : ''},\n\nConfirm your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: `
        <div style="font-family: Arial, sans-serif; font-size: 16px;">
          <p>${name ? `Hi ${name},` : 'Hi,'}</p>
          <p>Thanks for signing up. Please confirm your email address by clicking the button below:</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Confirm Email</a></p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>This link expires in 24 hours.</p>
        </div>
      `,
    });
  }

  // ── Password reset (forgot password) ─────────────────────────────────────
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    // Always return success to caller; only send if user exists.
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(rawToken);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    try {
      await this.sendPasswordResetEmail(user.email, rawToken, user.name || undefined);
    } catch (err) {
      console.error('[authService.requestPasswordReset] send failed', err);
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = sha256(rawToken);
    const user = await prisma.user.findFirst({ where: { passwordResetTokenHash: tokenHash } });
    if (!user) throw new Error('Invalid or expired reset token');
    if (!user.passwordResetTokenExpiry || user.passwordResetTokenExpiry < new Date()) {
      throw new Error('Invalid or expired reset token');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedNewPassword,
          passwordResetTokenHash: null,
          passwordResetTokenExpiry: null,
          passwordChangedAt: new Date(),
          tokenVersion: { increment: 1 },
          loginFailureCount: 0,
          lockedUntil: null,
        },
      }),
      // Revoke every outstanding refresh token for this user — force re-login
      // on every device.
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async sendPasswordResetEmail(email: string, rawToken: string, name?: string) {
    const resetUrl = `${authEnv.FRONTEND_URL}/auth/reset-password?token=${rawToken}`;
    await sendMail({
      to: email,
      subject: 'Reset your password',
      text: `Hi${name ? ' ' + name : ''},\n\nReset your password: ${resetUrl}\n\nIf you didn't request this, ignore this email. This link expires in 1 hour.`,
      html: `
        <div style="font-family: Arial, sans-serif; font-size: 16px;">
          <p>${name ? `Hi ${name},` : 'Hi,'}</p>
          <p>We received a request to reset your password. Click the button below to set a new one:</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Reset Password</a></p>
          <p>If you didn't request this, you can safely ignore this email.</p>
          <p>This link expires in 1 hour.</p>
        </div>
      `,
    });
  }

  // ── Access token (JWT) ───────────────────────────────────────────────────
  private generateAccessToken(userId: number, email: string, tokenVersion: number): string {
    return jwt.sign(
      { userId, email, tv: tokenVersion } satisfies Omit<JWTPayload, 'iat' | 'exp'>,
      authEnv.JWT_SECRET,
      { expiresIn: authEnv.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] },
    );
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, authEnv.JWT_SECRET) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) throw new Error('Token expired');
      throw new Error('Invalid token');
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, tokenVersion: true },
    });
    if (!user) throw new Error('Invalid token');
    if (typeof decoded.tv !== 'number' || decoded.tv !== user.tokenVersion) {
      throw new Error('Token version mismatch');
    }
    return decoded;
  }

  // ── Refresh token (opaque, rotated, family-tracked) ──────────────────────
  private async issueRefreshToken(
    userId: number,
    parentId: number | null,
    ctx: RefreshContext,
  ): Promise<string> {
    const rawToken = generateOpaqueToken();
    const familyId = parentId === null ? uuidv4() : undefined;

    // If rotating, inherit the parent's familyId.
    let resolvedFamilyId: string;
    if (parentId !== null) {
      const parent = await prisma.refreshToken.findUnique({ where: { id: parentId } });
      if (!parent) throw new Error('Parent refresh token not found');
      resolvedFamilyId = parent.familyId;
    } else {
      resolvedFamilyId = familyId!;
    }

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(rawToken),
        familyId: resolvedFamilyId,
        parentId,
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
        expiresAt: refreshTokenExpiryDate(),
      },
    });
    return rawToken;
  }

  async refreshAccessToken(rawRefreshToken: string, ctx: RefreshContext = {}): Promise<AuthResponse> {
    const tokenHash = sha256(rawRefreshToken);
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!row) {
      throw new Error('Invalid refresh token');
    }

    // Reuse-detection: an already-revoked token in this family was just
    // presented. Treat as theft and revoke the whole family.
    if (row.revokedAt) {
      await prisma.$transaction([
        prisma.refreshToken.update({
          where: { id: row.id },
          data: { reusedAt: new Date() },
        }),
        prisma.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      throw new Error('Refresh token reuse detected');
    }

    if (row.expiresAt < new Date()) {
      throw new Error('Refresh token expired');
    }

    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { id: true, email: true, name: true, emailVerified: true, tokenVersion: true },
    });
    if (!user) throw new Error('Invalid refresh token');

    // Rotate: revoke current row, issue child.
    await prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const newRefreshToken = await this.issueRefreshToken(user.id, row.id, ctx);
    const newAccessToken = this.generateAccessToken(user.id, user.email, user.tokenVersion);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        emailVerified: user.emailVerified,
      },
      token: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // Single-device logout: revoke just this token's family.
  async invalidateRefreshToken(rawRefreshToken: string | null | undefined, userId: number): Promise<void> {
    if (rawRefreshToken) {
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawRefreshToken) } });
      if (row && row.userId === userId) {
        await prisma.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return;
      }
    }
    // Fallback: revoke ALL of the user's active tokens (logout-everywhere).
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ── User CRUD ────────────────────────────────────────────────────────────
  async getUserById(userId: number) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        googleId: true,
        createdAt: true,
        domains: {
          select: {
            id: true,
            url: true,
            host: true,
            createdAt: true,
            _count: { select: { keywords: true, crawls: true } },
          },
        },
      },
    });
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (!user.password) throw new Error('Account has no password set');

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) throw new Error('Current password is incorrect');

    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedNewPassword,
          passwordChangedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async updateProfile(userId: number, name?: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { name } });
  }

  // ── Google login / signup ────────────────────────────────────────────────
  async loginOrCreateWithGoogle(input: {
    googleId: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
    ctx?: RefreshContext;
  }): Promise<AuthResponse> {
    const { googleId, emailVerified, name } = input;
    const email = input.email.trim().toLowerCase();
    const ctx = input.ctx ?? {};

    // 1. Match by stable googleId first.
    let user = await prisma.user.findUnique({ where: { googleId } });

    // 2. Fall back to matching by verified email (only if Google says
    //    verified — otherwise we'd risk linking to a hijacked account).
    if (!user && emailVerified) {
      user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, emailVerified: true },
        });
      }
    }

    // 3. Brand-new account.
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          name: name ?? undefined,
          // Password is nullable for Google-only accounts.
          password: null,
          emailVerified,
        },
      });
    }

    const accessToken = this.generateAccessToken(user.id, user.email, user.tokenVersion);
    const refreshToken = await this.issueRefreshToken(user.id, null, ctx);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), loginFailureCount: 0, lockedUntil: null },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        emailVerified: user.emailVerified,
      },
      token: accessToken,
      refreshToken,
    };
  }
}

export const authService = new AuthService();
