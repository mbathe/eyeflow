import { IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, Min, Max, IsUUID } from 'class-validator';
import { SuggestionPriority, SuggestionSource } from '../suggestion.entity';

export class CreateSuggestionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(SuggestionPriority)
  @IsOptional()
  priority?: SuggestionPriority;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  confidence?: number;

  @IsString()
  @IsOptional()
  impact?: string;

  @IsEnum(SuggestionSource)
  @IsOptional()
  source?: SuggestionSource;

  @IsString()
  @IsOptional()
  sourceId?: string;

  @IsOptional()
  suggestedAction?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  category?: string;
}
