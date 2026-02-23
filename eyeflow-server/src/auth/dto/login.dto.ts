import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@eyeflow.io' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'str0ngP@ss!' })
  @IsString()
  @MinLength(1)
  password!: string;
}
