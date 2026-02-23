import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Stores revoked JWT IDs (JTI) until they naturally expire.
 * Checked by JwtStrategy on every authenticated request.
 * A scheduled cleanup (TokenCleanupService) removes expired entries.
 */
@Entity('revoked_tokens')
export class RevokedTokenEntity {
  /** JWT ID — included in every access token payload as `jti` */
  @PrimaryColumn({ type: 'varchar', length: 36 })
  jti!: string;

  /** Owner — for bulk-revoke on logout-all or account deactivation */
  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  /** When the original JWT expires — used to clean up stale rows */
  @Index()
  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @CreateDateColumn()
  revokedAt!: Date;
}
