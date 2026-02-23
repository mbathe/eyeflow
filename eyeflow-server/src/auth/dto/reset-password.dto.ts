import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received in the reset-password email' })
  @IsString()
  token!: string;

  @ApiProperty({ description: 'New password (min 8 chars)', example: 'NewStr0ng@2025!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  newPassword!: string;
}
