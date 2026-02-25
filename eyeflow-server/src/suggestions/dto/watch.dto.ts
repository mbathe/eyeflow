import { IsString, IsArray, IsOptional, IsNumber, IsBoolean, IsEnum, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WatchPromptMode } from '../suggestion-watch.entity';

export class CreateWatchDto {
  @ApiProperty({ example: 'Monitor MQTT broker every 10 min' })
  @IsString() @MaxLength(255)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ type: [String], description: 'Connector UUIDs to watch' })
  @IsArray() @IsString({ each: true })
  connectorIds!: string[];

  @ApiProperty({ enum: WatchPromptMode, default: WatchPromptMode.MANUAL })
  @IsEnum(WatchPromptMode)
  promptMode!: WatchPromptMode;

  @ApiProperty({ description: 'Analysis prompt (empty = will be AI-generated)' })
  @IsOptional() @IsString()
  prompt?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  systemPrompt?: string;

  @ApiProperty({ default: 30, minimum: 1, maximum: 10080 })
  @IsNumber() @Min(1) @Max(10080)
  intervalMinutes!: number;

  @ApiProperty({ default: 20, minimum: 0, maximum: 50 })
  @IsOptional() @IsNumber() @Min(0) @Max(50)
  jitterPercent?: number;

  @ApiProperty({ default: true })
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ default: 5, minimum: 1, maximum: 20 })
  @IsOptional() @IsNumber() @Min(1) @Max(20)
  maxSuggestionsPerRun?: number;

  @ApiProperty({ default: 50, minimum: 0, maximum: 100 })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  minConfidence?: number;
}

export class UpdateWatchDto {
  @IsOptional() @IsString() @MaxLength(255)
  name?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  connectorIds?: string[];

  @IsOptional() @IsEnum(WatchPromptMode)
  promptMode?: WatchPromptMode;

  @IsOptional() @IsString()
  prompt?: string;

  @IsOptional() @IsString()
  systemPrompt?: string;

  @IsOptional() @IsNumber() @Min(1) @Max(10080)
  intervalMinutes?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(50)
  jitterPercent?: number;

  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsNumber() @Min(1) @Max(20)
  maxSuggestionsPerRun?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  minConfidence?: number;
}

export class GeneratePromptDto {
  @ApiProperty({ type: [String] })
  @IsArray() @IsString({ each: true })
  connectorIds!: string[];

  @ApiProperty({ required: false, description: 'Extra instructions for the prompt generator' })
  @IsOptional() @IsString()
  userHint?: string;
}
