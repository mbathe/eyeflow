import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../authorization/enums/roles.enum';

export class RegisterDto {
  @ApiProperty({ example: 'admin@eyeflow.io' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'str0ngP@ss!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;

  @ApiProperty({ example: 'Alice' })
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Martin' })
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.VIEWER })
  @IsOptional()
  role?: UserRole;
}
