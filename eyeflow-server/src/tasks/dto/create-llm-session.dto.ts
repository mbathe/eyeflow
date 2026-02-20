import { IsArray, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLLMSessionDto {
  @ApiPropertyOptional({ description: 'Optional session name to show in UI' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Allowed connector ids (catalog)', example: ['slack','postgres'] })
  @IsOptional()
  @IsArray()
  allowedConnectorIds?: string[] = [];

  @ApiPropertyOptional({ description: 'Allowed function ids (fine-grain)', example: ['slack_send_message'] })
  @IsOptional()
  @IsArray()
  allowedFunctionIds?: string[] = [];

  @ApiPropertyOptional({ description: 'TTL in minutes (ephemeral session). Default: 30' })
  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMinutes?: number = 30;
}
