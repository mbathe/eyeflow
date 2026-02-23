import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, LessThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UserEntity } from './entities/user.entity';
import { RevokedTokenEntity } from './entities/revoked-token.entity';
import { EmailService } from './services/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserRole } from '../authorization/enums/roles.enum';
import { JwtPayload } from './strategies/jwt.strategy';
import { GoogleProfile } from './strategies/google.strategy';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_EXPIRY_HOURS = 1;
const VERIFY_TOKEN_EXPIRY_HOURS = 24;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(RevokedTokenEntity)
    private revokedRepo: Repository<RevokedTokenEntity>,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  // ── Registration ──────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const count = await this.userRepo.count();
    const role = count === 0 ? UserRole.SUPER_ADMIN : (dto.role ?? UserRole.VIEWER);

    const verificationToken = this._generateToken();
    const user = this.userRepo.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: new Date(Date.now() + VERIFY_TOKEN_EXPIRY_HOURS * 3600_000),
      // First user is auto-verified (system bootstrap)
      emailVerified: count === 0,
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`User registered: ${saved.email} (${saved.role})`);

    if (count > 0) {
      // Fire-and-forget — don't block the response on email delivery
      this.emailService
        .sendEmailVerification(saved.email, saved.firstName, verificationToken)
        .catch(() => {});
    } else {
      this.emailService.sendWelcomeEmail(saved.email, saved.firstName).catch(() => {});
    }

    return this._issueTokens(saved);
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ip?: string) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    // Check account lockout
    this._checkLockout(user);

    const valid = await user.validatePassword(dto.password);
    if (!valid) {
      await this._incrementFailedAttempts(user, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login — reset counter
    await this._resetFailedAttempts(user);
    this.logger.log(`User logged in: ${user.email}`);
    return this._issueTokens(user);
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  async refresh(user: UserEntity) {
    return this._issueTokens(user);
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string, jti?: string, jtiExp?: number): Promise<void> {
    // Revoke the access token JTI so it cannot be reused
    if (jti) {
      const expiresAt = jtiExp ? new Date(jtiExp * 1000) : new Date(Date.now() + 900_000);
      await this.revokedRepo.upsert(
        { jti, userId, expiresAt },
        ['jti'],
      );
    }
    await this.userRepo.update({ id: userId }, { refreshTokenHash: null });
    this.logger.log(`User logged out: ${userId}`);
  }

  // ── Me ────────────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId, isActive: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user.toSafeObject();
  }

  // ── Change password ───────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await user.validatePassword(dto.currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    user.password = dto.newPassword;
    user.refreshTokenHash = null;
    await this.userRepo.save(user);
    this.logger.log(`Password changed for user: ${userId}`);
  }

  // ── Email verification ────────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user) throw new BadRequestException('Invalid verification token');
    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await this.userRepo.save(user);

    return { message: 'Email verified successfully' };
  }

  async resendVerification(userId: string): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) throw new BadRequestException('Email already verified');

    const token = this._generateToken();
    user.emailVerificationToken = token;
    user.emailVerificationExpires = new Date(Date.now() + VERIFY_TOKEN_EXPIRY_HOURS * 3600_000);
    await this.userRepo.save(user);

    await this.emailService.sendEmailVerification(user.email, user.firstName, token).catch(() => {});

    return { message: 'Verification email resent' };
  }

  // ── Forgot / Reset password ───────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    // Always return the same message to avoid email enumeration
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (user && user.isActive) {
      const token = this._generateToken();
      user.passwordResetToken = token;
      user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 3600_000);
      await this.userRepo.save(user);

      await this.emailService.sendPasswordReset(user.email, user.firstName, token).catch(() => {});
    }
    return { message: 'If that email is registered, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({
      where: { passwordResetToken: dto.token },
    });

    if (!user) throw new BadRequestException('Invalid or expired reset token');
    if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    user.password = dto.newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.refreshTokenHash = null; // invalidate all sessions
    await this.userRepo.save(user);

    return { message: 'Password reset successfully' };
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  async googleLogin(profile: GoogleProfile) {
    if (!profile.email) throw new BadRequestException('No email provided by Google');

    // Try by googleId first
    let user = await this.userRepo.findOne({ where: { googleId: profile.googleId } });

    if (!user) {
      // Try to link to existing account by email
      user = await this.userRepo.findOne({ where: { email: profile.email } });

      if (user) {
        // Link existing account to Google
        user.googleId = profile.googleId;
        if (!user.avatarUrl && profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
        user.emailVerified = true; // Google already verified the email
        await this.userRepo.save(user);
      } else {
        // Create a new account
        const count = await this.userRepo.count();
        const randomPw = randomBytes(32).toString('hex'); // unusable password — OAuth login only
        user = this.userRepo.create({
          email: profile.email,
          password: randomPw,
          firstName: profile.firstName,
          lastName: profile.lastName || 'User',
          googleId: profile.googleId,
          avatarUrl: profile.avatarUrl,
          emailVerified: true,
          role: count === 0 ? UserRole.SUPER_ADMIN : UserRole.VIEWER,
        });
        user = await this.userRepo.save(user);
        await this.emailService.sendWelcomeEmail(user.email, user.firstName).catch(() => {});
      }
    }

    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');
    this._checkLockout(user);

    this.logger.log(`Google login: ${user.email}`);
    return this._issueTokens(user);
  }

  // ── Token revocation check (used by JwtStrategy) ──────────────────────────

  async isTokenRevoked(jti: string): Promise<boolean> {
    const entry = await this.revokedRepo.findOne({ where: { jti } });
    return !!entry;
  }

  /** Periodic cleanup — removes expired revocation entries. */
  async cleanupExpiredTokens(): Promise<void> {
    const result = await this.revokedRepo.delete({ expiresAt: LessThan(new Date()) });
    if (result.affected) {
      this.logger.log(`Cleaned up ${result.affected} expired revoked token(s)`);
    }
  }

  // ── User management ───────────────────────────────────────────────────────

  async listUsers(requestingUser: UserEntity) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(requestingUser.role)) {
      throw new ForbiddenException('Insufficient privileges');
    }
    const users = await this.userRepo.find({ order: { createdAt: 'DESC' } });
    return users.map(u => u.toSafeObject());
  }

  async updateUserRole(requestingUser: UserEntity, targetUserId: string, newRole: UserRole) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can change roles');
    }
    if (requestingUser.id === targetUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');

    target.role = newRole;
    await this.userRepo.save(target);
    return target.toSafeObject();
  }

  async deactivateUser(requestingUser: UserEntity, targetUserId: string) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(requestingUser.role)) {
      throw new ForbiddenException('Insufficient privileges');
    }
    if (requestingUser.id === targetUserId) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');

    target.isActive = false;
    target.refreshTokenHash = null;
    await this.userRepo.save(target);
    return { deactivated: true };
  }

  // ── Admin: unlock account ─────────────────────────────────────────────────

  async unlockAccount(requestingUser: UserEntity, targetUserId: string) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(requestingUser.role)) {
      throw new ForbiddenException('Insufficient privileges');
    }
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');

    target.failedLoginAttempts = 0;
    target.lockedUntil = null;
    target.lastFailedLoginAt = null;
    target.lastFailedLoginIp = null;
    await this.userRepo.save(target);
    return { unlocked: true };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _checkLockout(user: UserEntity): void {
    if (user.isLocked) {
      const secondsLeft = Math.ceil(
        (user.lockedUntil!.getTime() - Date.now()) / 1000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Account temporarily locked. Try again in ${secondsLeft} seconds.`,
          retryAfter: secondsLeft,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async _incrementFailedAttempts(user: UserEntity, ip?: string): Promise<void> {
    user.failedLoginAttempts += 1;
    user.lastFailedLoginAt = new Date();
    if (ip) user.lastFailedLoginIp = ip;

    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
      this.logger.warn(
        `Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts: ${user.email} (IP: ${ip ?? 'unknown'})`,
      );
    }

    await this.userRepo.save(user);
  }

  private async _resetFailedAttempts(user: UserEntity): Promise<void> {
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await this.userRepo.save(user);
    }
  }

  private _generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  async _issueTokens(user: UserEntity) {
    const jti = randomBytes(16).toString('hex'); // unique token ID for revocation
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRATION', '15m'),
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRATION', '7d'),
      },
    );

    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.userRepo.save(user);

    return {
      accessToken,
      refreshToken,
      user: user.toSafeObject(),
    };
  }
}
