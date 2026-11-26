import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Throttle, minutes } from '@nestjs/throttler';
import type { User } from '../users/user.js';
import { IdentitiesRepository } from '../users/identities.repository.js';
import { connectGoogleSchema, type ConnectGoogleDto } from './auth.schemas.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { IdentitiesService } from './identities.service.js';

@Controller('me/identities')
export class IdentitiesController {
  constructor(
    private readonly identitiesRepository: IdentitiesRepository,
    private readonly googleIdTokenVerifier: GoogleIdTokenVerifier,
    private readonly identitiesService: IdentitiesService,
  ) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.identitiesRepository.list(userId);
  }

  // It checks a password, so it's limited like sign-in.
  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  @Post('google')
  @HttpCode(204)
  async connect(@CurrentUser() user: User, @Body({ schema: connectGoogleSchema }) body: ConnectGoogleDto) {
    const google = await this.googleIdTokenVerifier.verify(body.credential);
    await this.identitiesService.connectGoogle(user, body.password, google);
  }

  @Delete('google')
  @HttpCode(204)
  disconnect(@CurrentUser('id') userId: string) {
    return this.identitiesService.disconnectGoogle(userId);
  }
}
