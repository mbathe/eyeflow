import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LLMSessionEntity } from '../entities/llm-session.entity';
import { CreateLLMSessionDto } from '../dto/create-llm-session.dto';
import { LLMContext } from '../types/connector-manifest.types';

@Injectable()
export class LLMSessionService {
  private readonly logger = new Logger(LLMSessionService.name);
  private readonly defaultTtlMinutes = 30;

  constructor(
    @InjectRepository(LLMSessionEntity)
    private readonly sessionRepo: Repository<LLMSessionEntity>,
  ) {}

  async createSession(userId: string, dto: CreateLLMSessionDto): Promise<LLMSessionEntity> {
    const ttl = dto.ttlMinutes ?? this.defaultTtlMinutes;
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

    const session = this.sessionRepo.create({
      userId,
      name: dto.name,
      allowedConnectorIds: dto.allowedConnectorIds || [],
      allowedFunctionIds: dto.allowedFunctionIds || [],
      allowedNodeIds: [],
      expiresAt,
    } as any);

    return this.sessionRepo.save(session as any);
  }

  async getSession(sessionId: string): Promise<LLMSessionEntity | null> {
    const s = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!s) return null;
    if (s.expiresAt.getTime() < Date.now()) return null;
    return s;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionRepo.delete(sessionId);
  }

  isSessionValid(session?: LLMSessionEntity | null): boolean {
    if (!session) return false;
    return session.expiresAt.getTime() > Date.now();
  }

  /**
   * Filter an LLMContext according to an LLMSession's allowed lists.
   * - returns a shallow-cloned + filtered context suitable to send to the LLM
   */
  filterLLMContext(context: LLMContext, session: LLMSessionEntity): LLMContext {
    if (!context || !session) return context;

    const allowedConnectorSet = new Set(session.allowedConnectorIds || []);
    const allowedFunctionSet = new Set(session.allowedFunctionIds || []);

    const connectors = context.connectors.filter((c) => {
      if (allowedConnectorSet.size === 0) return true; // empty => allow-all
      return allowedConnectorSet.has(c.id);
    });

    const nodes = context.nodes.filter((n) => {
      if (allowedConnectorSet.size === 0) return true;
      return allowedConnectorSet.has(n.connectorId);
    });

    const functions = context.functions.filter((f) => {
      if (allowedConnectorSet.size === 0 && allowedFunctionSet.size === 0) return true;
      if (allowedFunctionSet.size > 0) return allowedFunctionSet.has(f.function.id);
      return allowedConnectorSet.has(f.connectorId);
    });

    const triggers = context.triggers.filter((t) => {
      if (allowedConnectorSet.size === 0) return true;
      return allowedConnectorSet.has(t.connectorId);
    });

    // shallow copy and return filtered
    return {
      ...context,
      connectors,
      nodes,
      functions,
      triggers,
    } as LLMContext;
  }
}
