import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateRuleFromIntentDto {
  @ApiProperty({ description: 'Natural language description of the desired rule', example: 'Alert the ops team when DB free memory < 15% for 2 minutes' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'If true, persist the first generated rule into DB', example: true })
  @IsOptional()
  @IsBoolean()
  create?: boolean = false;
}
