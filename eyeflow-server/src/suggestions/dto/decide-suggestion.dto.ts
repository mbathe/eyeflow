import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';

export enum DecisionVerb {
  ACCEPT  = 'accept',
  REJECT  = 'reject',
  DEFER   = 'defer',
}

export class DecideSuggestionDto {
  @IsEnum(DecisionVerb)
  decision!: DecisionVerb;

  @IsString()
  @IsOptional()
  comment?: string;

  /** ISO date — required when decision is DEFER */
  @IsDateString()
  @IsOptional()
  deferUntil?: string;
}
