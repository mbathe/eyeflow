import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Ephemeral LLM Session
 * - Users create a short-lived session and pick allowed catalog elements
 * - The session is used to scope the LLM context and enforce runtime checks
 */
@Entity('llm_sessions')
@Index(['userId', 'expiresAt'])
export class LLMSessionEntity {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  userId!: string;

  @ApiProperty({ description: 'Optional human name for the session' })
  @Column({ type: 'varchar', length: 128, nullable: true })
  name?: string;

  @ApiProperty({ description: 'Allowed connector ids (catalog scope)' })
  @Column({ type: 'text', array: true, default: '{}' })
  allowedConnectorIds!: string[];

  @ApiProperty({ description: 'Allowed function ids (optional fine-grain scope)' })
  @Column({ type: 'text', array: true, default: '{}' })
  allowedFunctionIds!: string[];

  @ApiProperty({ description: 'Optional allowed node ids' })
  @Column({ type: 'text', array: true, default: '{}' })
  allowedNodeIds!: string[];

  @ApiProperty({ description: 'When this session expires (ephemeral)' })
  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt!: Date;
}
