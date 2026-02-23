import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../authorization/enums/roles.enum';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  password!: string; // bcrypt hash

  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.VIEWER,
  })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** Hashed refresh token stored server-side for rotation validation */
  @Column({ type: 'varchar', nullable: true })
  refreshTokenHash!: string | null;

  /** Internal service account flag — skips password check */
  @Column({ type: 'boolean', default: false })
  isServiceAccount!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt!: Date | null;

  // ── Brute-force lockout ───────────────────────────────────────────────────

  /** Number of consecutive failed login attempts */
  @Column({ type: 'int', default: 0 })
  failedLoginAttempts!: number;

  /** Set when account is temporarily locked (auto-unlocks at this time) */
  @Column({ type: 'timestamp', nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastFailedLoginAt!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastFailedLoginIp!: string | null;

  // ── Email verification ────────────────────────────────────────────────────

  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  emailVerificationToken!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpires!: Date | null;

  // ── Password reset ────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 128, nullable: true })
  passwordResetToken!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpires!: Date | null;

  // ── OAuth (Google) ────────────────────────────────────────────────────────

  /** Google subject ID — null for local accounts */
  @Index({ unique: true, sparse: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  googleId!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl!: string | null;

  // ── Computed helpers ──────────────────────────────────────────────────────

  /** Returns true if the account is currently locked */
  get isLocked(): boolean {
    return !!this.lockedUntil && this.lockedUntil > new Date();
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  async validatePassword(plainText: string): Promise<boolean> {
    return bcrypt.compare(plainText, this.password);
  }

  /** Hash plain-text password before any save */
  @BeforeInsert()
  @BeforeUpdate()
  async hashPasswordIfChanged(): Promise<void> {
    // Only hash if password looks like a plain-text (not already a bcrypt hash)
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  toSafeObject() {
    return {
      id: this.id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      role: this.role,
      isActive: this.isActive,
      emailVerified: this.emailVerified,
      avatarUrl: this.avatarUrl,
      isLocked: this.isLocked,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
