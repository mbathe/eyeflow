import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  Res,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { UserEntity } from './entities/user.entity';
import { UserRole } from '../authorization/enums/roles.enum';
import { GoogleProfile } from './strategies/google.strategy';

type AuthenticatedUser = UserEntity & { _jti?: string; _exp?: number };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Public: register / login ───────────────────────────────────────────────

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new user. First user becomes SUPER_ADMIN.' })
  @ApiResponse({ status: 201, description: 'User created, tokens returned' })
  @ApiResponse({ status: 409, description: 'Email already taken' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email / password' })
  @ApiResponse({ status: 200, description: 'Access + refresh token returned' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Account locked after too many failures' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
    return this.authService.login(dto, ip);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiOperation({ summary: 'Rotate tokens using a valid refresh token' })
  @ApiResponse({ status: 200, description: 'New token pair returned' })
  async refresh(@CurrentUser() user: UserEntity, @Body() _dto: RefreshTokenDto) {
    return this.authService.refresh(user);
  }

  // ── Public: email verification ─────────────────────────────────────────────

  @Get('verify-email')
  @Public()
  @ApiOperation({ summary: 'Verify email address via token from email' })
  @ApiQuery({ name: 'token', description: 'Token received in the verification email' })
  @ApiResponse({ status: 200, description: 'Email verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // ── Public: forgot / reset password ───────────────────────────────────────

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent (if account exists)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using the token from email' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ── Public: Google OAuth ──────────────────────────────────────────────────

  @Get('google')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login (redirects to Google)' })
  async googleAuth() {
    // Handled by Passport — redirects to Google
  }

  @Get('google/callback')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback — redirects to frontend with JWT tokens' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend /auth/callback with tokens' })
  async googleCallback(
    @CurrentUser() profile: GoogleProfile,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (!profile) {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
    try {
      const tokens = await this.authService.googleLogin(profile);
      const params = new URLSearchParams({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      return res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
    } catch {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }

  // ── Protected: token management ───────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — revokes access token JTI + clears refresh token' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    await this.authService.logout(user.id, user._jti, user._exp);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.authService.getProfile(user.id);
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change own password (invalidates all sessions)' })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    if (!user) throw new UnauthorizedException();
    await this.authService.changePassword(user.id, dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Email already verified' })
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.authService.resendVerification(user.id);
  }

  // ── Preferences ─────────────────────────────────────────────────────────

  @Get('preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user preferences' })
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.authService.getPreferences(user.id);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user preferences' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.authService.updatePreferences(user.id, dto);
  }

  // ── Admin: user management ────────────────────────────────────────────────

  @Get('users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all users (ADMIN / SUPER_ADMIN only)' })
  async listUsers(@CurrentUser() user: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.authService.listUsers(user);
  }

  @Patch('users/:id/role')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change a user\'s role (SUPER_ADMIN only)' })
  async changeRole(
    @CurrentUser() requestingUser: AuthenticatedUser,
    @Param('id') targetId: string,
    @Body('role') newRole: UserRole,
  ) {
    if (!requestingUser) throw new UnauthorizedException();
    return this.authService.updateUserRole(requestingUser, targetId, newRole);
  }

  @Delete('users/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a user (ADMIN / SUPER_ADMIN only)' })
  async deactivateUser(
    @CurrentUser() requestingUser: AuthenticatedUser,
    @Param('id') targetId: string,
  ) {
    if (!requestingUser) throw new UnauthorizedException();
    return this.authService.deactivateUser(requestingUser, targetId);
  }

  @Post('users/:id/unlock')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually unlock a locked account (ADMIN / SUPER_ADMIN only)' })
  async unlockAccount(
    @CurrentUser() requestingUser: AuthenticatedUser,
    @Param('id') targetId: string,
  ) {
    if (!requestingUser) throw new UnauthorizedException();
    return this.authService.unlockAccount(requestingUser, targetId);
  }
}
