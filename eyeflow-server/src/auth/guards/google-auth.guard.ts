import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Used on GET /auth/google — redirects to Google consent screen */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
