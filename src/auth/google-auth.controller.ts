import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public, TokenService } from '@nestjs/authentication';
import { ApiSecurity } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { googleSignInSchema, type GoogleSignInDto } from './auth.schemas.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { GoogleSignInService } from './google-sign-in.service.js';

@Public()
@ApiSecurity({})
@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly googleIdTokenVerifier: GoogleIdTokenVerifier,
    private readonly googleSignInService: GoogleSignInService,
    private readonly tokenService: TokenService,
  ) {}

  // The same tokens as POST /auth/token, for a Google ID token.
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  @Post()
  @HttpCode(200)
  async signIn(@Body({ schema: googleSignInSchema }) body: GoogleSignInDto) {
    const google = await this.googleIdTokenVerifier.verify(body.credential);
    const user = await this.googleSignInService.signIn(google);
    return this.tokenService.issue(user.id, { method: 'oidc:google' });
  }
}
