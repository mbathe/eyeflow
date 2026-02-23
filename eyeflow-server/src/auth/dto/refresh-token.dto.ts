import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Opaque refresh token returned by /auth/login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
