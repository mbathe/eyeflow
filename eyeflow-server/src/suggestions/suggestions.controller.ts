import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { DecideSuggestionDto } from './dto/decide-suggestion.dto';
import { SuggestionStatus } from './suggestion.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEntity } from '../auth/entities/user.entity';
import { RequirePermissions } from '../authorization/decorators/require-permission.decorator';
import { Permission } from '../authorization/enums/permissions.enum';

@Controller('suggestions')
export class SuggestionsController {
  private readonly logger = new Logger(SuggestionsController.name);

  constructor(private readonly service: SuggestionsService) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  @Post()
  @RequirePermissions(Permission.SUGGESTIONS_CREATE)
  async create(
    @Body() dto: CreateSuggestionDto,
    @CurrentUser() user: UserEntity,
  ) {
    const suggestion = await this.service.create(dto, user?.id);
    return { success: true, suggestion };
  }

  // ── List / filter ────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions(Permission.SUGGESTIONS_READ)
  async findAll(@Query('status') status?: SuggestionStatus) {
    const suggestions = await this.service.findAll(status);
    return { total: suggestions.length, suggestions };
  }

  @Get('pending')
  @RequirePermissions(Permission.SUGGESTIONS_READ)
  async findPending() {
    const suggestions = await this.service.findPending();
    return { total: suggestions.length, suggestions };
  }

  @Get('count/pending')
  @RequirePermissions(Permission.SUGGESTIONS_READ)
  async countPending() {
    const count = await this.service.countPending();
    return { count };
  }

  @Get('stats')
  @RequirePermissions(Permission.SUGGESTIONS_READ)
  async stats() {
    return this.service.stats();
  }

  // ── Single ───────────────────────────────────────────────────────────────────

  @Get(':id')
  @RequirePermissions(Permission.SUGGESTIONS_READ)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  // ── Decision endpoints ───────────────────────────────────────────────────────

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.SUGGESTIONS_DECIDE)
  async decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideSuggestionDto,
    @CurrentUser() user: UserEntity,
  ) {
    const suggestion = await this.service.decide(id, dto, user?.id);
    return { success: true, suggestion };
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.SUGGESTIONS_DECIDE)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.service.remove(id);
  }
}
