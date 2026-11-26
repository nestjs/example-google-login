import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwksClient, JwtError, JwtVerifier } from '@nestjs/authentication';
import type { Env } from '../config.js';

/** What the API takes from a verified Google ID token. */
export interface GoogleAccount {
  /** Google's id for the account: stable, never reused. */
  subject: string;
  email?: string;
  /** Whether Google verified that the account owns `email`. */
  emailVerified: boolean;
}

// Google documents both values of `iss` for its ID tokens.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

@Injectable()
export class GoogleIdTokenVerifier {
  private readonly logger = new Logger(GoogleIdTokenVerifier.name);
  private readonly verifier: JwtVerifier;

  constructor(config: ConfigService<Env, true>) {
    this.verifier = new JwtVerifier({
      jwks: new JwksClient(config.get('GOOGLE_JWKS_URL', { infer: true })),
      // A token must name one of them.
      issuer: GOOGLE_ISSUERS,
      // Tokens issued to any other client of Google's are refused.
      audience: config.get('GOOGLE_CLIENT_IDS', { infer: true }),
      required: ['exp', 'sub'],
      // Google's clock and this server's are never quite the same.
      clockTolerance: '30s',
    });
  }

  async verify(idToken: string): Promise<GoogleAccount> {
    try {
      const claims = await this.verifier.verify(idToken);
      return {
        subject: claims.sub!,
        email: typeof claims.email === 'string' ? claims.email : undefined,
        emailVerified: claims.email_verified === true,
      };
    } catch (error) {
      if (error instanceof JwtError) {
        throw new UnauthorizedException(`Invalid Google ID token: ${error.message}`);
      }
      // Google's keys couldn't be fetched: not the client's fault, and worth retrying.
      this.logger.error('Google ID token verification failed', error);
      throw new ServiceUnavailableException('Google sign-in is unavailable');
    }
  }
}
