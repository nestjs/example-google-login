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
  private readonly verifiers: Map<string, JwtVerifier>;

  constructor(config: ConfigService<Env, true>) {
    // One key set, fetched and cached for both verifiers.
    const jwks = new JwksClient(config.get('GOOGLE_JWKS_URL', { infer: true }));
    const verify = (issuer: string) =>
      new JwtVerifier({
        jwks,
        issuer,
        // Tokens issued to any other client of Google's are refused.
        audience: config.get('GOOGLE_CLIENT_IDS', { infer: true }),
        required: ['exp', 'sub'],
        // Google's clock and this server's are never quite the same.
        clockTolerance: '30s',
      });
    this.verifiers = new Map(GOOGLE_ISSUERS.map((issuer) => [issuer, verify(issuer)]));
  }

  async verify(idToken: string): Promise<GoogleAccount> {
    // Picks the verifier for the issuer the token names, which that verifier then checks.
    const verifier = this.verifiers.get(unverifiedIssuer(idToken)) ?? this.verifiers.get(GOOGLE_ISSUERS[0])!;
    try {
      const claims = await verifier.verify(idToken);
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

/** The `iss` claim, read without verifying anything. */
function unverifiedIssuer(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    return typeof payload?.iss === 'string' ? payload.iss : '';
  } catch {
    return '';
  }
}
