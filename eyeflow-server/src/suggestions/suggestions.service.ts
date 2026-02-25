import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import {
  SuggestionEntity,
  SuggestionStatus,
  SuggestionPriority,
  SuggestionSource,
} from './suggestion.entity';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { DecideSuggestionDto, DecisionVerb } from './dto/decide-suggestion.dto';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

// ── Priority ordering for sorting ───────────────────────────────────────────

const PRIORITY_ORDER: Record<SuggestionPriority, number> = {
  [SuggestionPriority.CRITICAL]: 0,
  [SuggestionPriority.HIGH]:     1,
  [SuggestionPriority.MEDIUM]:   2,
  [SuggestionPriority.LOW]:      3,
};

// ── State-machine: valid transitions ─────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  [SuggestionStatus.PENDING]:  [SuggestionStatus.ACCEPTED, SuggestionStatus.REJECTED, SuggestionStatus.DEFERRED],
  [SuggestionStatus.DEFERRED]: [SuggestionStatus.ACCEPTED, SuggestionStatus.REJECTED, SuggestionStatus.PENDING],
  [SuggestionStatus.ACCEPTED]: [],  // terminal
  [SuggestionStatus.REJECTED]: [],  // terminal
};

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(
    @InjectRepository(SuggestionEntity)
    private readonly repo: Repository<SuggestionEntity>,
    @Optional() private readonly bus: RealtimeEventsService,
  ) {
    // Listen for snapshot requests from the gateway
    this.bus?.on('request.snapshot', async ({ clientId }: { clientId: string }) => {
      try {
        const stats = await this.stats();
        this.bus.emit('suggestions.snapshot', { clientId, data: stats });
      } catch { /* silent */ }
    });
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(dto: CreateSuggestionDto, createdBy?: string): Promise<SuggestionEntity> {
    const suggestion = this.repo.create({
      ...dto,
      status: SuggestionStatus.PENDING,
      createdBy,
      source:   dto.source     ?? SuggestionSource.MANUAL,
      priority: dto.priority   ?? SuggestionPriority.MEDIUM,
      confidence: dto.confidence ?? 70,
    });
    const saved = await this.repo.save(suggestion);
    this.logger.log(`Suggestion created: ${saved.id} — "${saved.title}"`);
    // Broadcast via event bus
    if (this.bus) {
      this.bus.emit('suggestion.created', saved);
      const count = await this.countPending();
      this.bus.emit('suggestions.count', { count });
    }
    return saved;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async findAll(status?: SuggestionStatus): Promise<SuggestionEntity[]> {
    const where: FindOptionsWhere<SuggestionEntity> = {};
    if (status) where.status = status;
    const rows = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    // Sort by priority within same status
    return rows.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }

  async findPending(): Promise<SuggestionEntity[]> {
    return this.findAll(SuggestionStatus.PENDING);
  }

  async countPending(): Promise<number> {
    return this.repo.count({ where: { status: SuggestionStatus.PENDING } });
  }

  async findById(id: string): Promise<SuggestionEntity> {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Suggestion ${id} not found`);
    return s;
  }

  // ── Decision state machine ─────────────────────────────────────────────────

  async decide(
    id: string,
    dto: DecideSuggestionDto,
    decidedBy: string,
  ): Promise<SuggestionEntity> {
    const suggestion = await this.findById(id);

    const targetStatus = this._verbToStatus(dto.decision);
    const allowed = ALLOWED_TRANSITIONS[suggestion.status];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from "${suggestion.status}" to "${targetStatus}"`,
      );
    }

    if (dto.decision === DecisionVerb.DEFER && !dto.deferUntil) {
      throw new BadRequestException('deferUntil is required when decision is "defer"');
    }

    suggestion.status         = targetStatus;
    suggestion.decidedBy      = decidedBy;
    suggestion.decidedAt      = new Date();
    suggestion.decisionComment = dto.comment;
    if (dto.deferUntil) {
      suggestion.deferUntil = new Date(dto.deferUntil);
    }

    const saved = await this.repo.save(suggestion);
    this.logger.log(`Suggestion ${id} → ${targetStatus} by ${decidedBy}`);
    // Broadcast via event bus
    if (this.bus) {
      this.bus.emit('suggestion.decided', { id, status: targetStatus });
      const count = await this.countPending();
      this.bus.emit('suggestions.count', { count });
    }
    return saved;
  }

  // ── Delete (admin only) ───────────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    const suggestion = await this.findById(id);
    await this.repo.remove(suggestion);
    this.logger.log(`Suggestion ${id} deleted`);
  }

  // ── Stats snapshot (for dashboard widget) ─────────────────────────────────

  async stats(): Promise<{
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    deferred: number;
    byPriority: Record<SuggestionPriority, number>;
  }> {
    const all = await this.repo.find();
    const byStatus = (s: SuggestionStatus) => all.filter(x => x.status === s).length;
    const byPriority = Object.values(SuggestionPriority).reduce((acc, p) => {
      acc[p] = all.filter(x => x.priority === p && x.status === SuggestionStatus.PENDING).length;
      return acc;
    }, {} as Record<SuggestionPriority, number>);

    return {
      total:    all.length,
      pending:  byStatus(SuggestionStatus.PENDING),
      accepted: byStatus(SuggestionStatus.ACCEPTED),
      rejected: byStatus(SuggestionStatus.REJECTED),
      deferred: byStatus(SuggestionStatus.DEFERRED),
      byPriority,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _verbToStatus(verb: DecisionVerb): SuggestionStatus {
    const map: Record<DecisionVerb, SuggestionStatus> = {
      [DecisionVerb.ACCEPT]:  SuggestionStatus.ACCEPTED,
      [DecisionVerb.REJECT]:  SuggestionStatus.REJECTED,
      [DecisionVerb.DEFER]:   SuggestionStatus.DEFERRED,
    };
    return map[verb];
  }
}
