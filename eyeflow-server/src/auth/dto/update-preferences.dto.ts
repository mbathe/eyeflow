import { IsOptional, IsIn, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: ['dark', 'light'] })
  @IsOptional()
  @IsIn(['dark', 'light'])
  themeMode?: 'dark' | 'light';

  @ApiPropertyOptional({ enum: ['blue', 'cyan', 'green', 'amber', 'violet', 'rose'] })
  @IsOptional()
  @IsIn(['blue', 'cyan', 'green', 'amber', 'violet', 'rose'])
  accentColor?: 'blue' | 'cyan' | 'green' | 'amber' | 'violet' | 'rose';

  @ApiPropertyOptional({ enum: ['comfortable', 'compact'] })
  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  density?: 'comfortable' | 'compact';

  @ApiPropertyOptional({ enum: ['fr', 'en'] })
  @IsOptional()
  @IsIn(['fr', 'en'])
  language?: 'fr' | 'en';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  browserNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sidebarCollapsed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showWelcomeBanner?: boolean;
}
