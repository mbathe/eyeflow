import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuggestionWatchService } from './suggestion-watch.service';
import { CreateWatchDto, UpdateWatchDto, GeneratePromptDto } from './dto/watch.dto';

@ApiTags('Suggestion Watches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('suggestions/watches')
export class SuggestionWatchController {
  constructor(private readonly svc: SuggestionWatchService) {}

  @Get()
  @ApiOperation({ summary: 'List all data-source watches for the current user' })
  list(@Request() req: any) {
    return this.svc.list(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single watch' })
  get(@Param('id') id: string, @Request() req: any) {
    return this.svc.get(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new scheduled data-source watch' })
  create(@Body() dto: CreateWatchDto, @Request() req: any) {
    return this.svc.create(dto, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing watch (reschedules automatically)' })
  update(@Param('id') id: string, @Body() dto: UpdateWatchDto, @Request() req: any) {
    return this.svc.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a watch and cancel its schedule' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.user.id);
  }

  @Post(':id/trigger')
  @ApiOperation({ summary: 'Manually trigger a watch run immediately' })
  trigger(@Param('id') id: string, @Request() req: any) {
    return this.svc.trigger(id, req.user.id);
  }

  @Post('generate-prompt')
  @ApiOperation({ summary: 'Ask AI to generate an optimal analysis prompt for given connectors' })
  generatePrompt(@Body() dto: GeneratePromptDto, @Request() req: any) {
    return this.svc.generatePrompt(dto.connectorIds, req.user.id, dto.userHint);
  }
}
