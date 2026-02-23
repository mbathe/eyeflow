import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

/**
 * Passport strategy for Google OAuth 2.0.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_CALLBACK_URL  (e.g. http://localhost:3000/auth/google/callback)
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID', 'dummy-id'),
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET', 'dummy-secret'),
      callbackURL: config.get<string>(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:3000/auth/google/callback',
      ),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const emails = profile.emails ?? [];
    const photos = profile.photos ?? [];
    const name = profile.name;

    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email: emails[0]?.value ?? '',
      firstName: name?.givenName ?? profile.displayName ?? '',
      lastName: name?.familyName ?? '',
      avatarUrl: photos[0]?.value ?? null,
    };

    done(null, googleProfile);
  }
}
