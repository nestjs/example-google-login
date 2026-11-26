import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { DrizzleRefreshTokenStore } from './drizzle-refresh-token.store.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import { IdentitiesController } from './identities.controller.js';
import { IdentitiesService } from './identities.service.js';
import { JwtAuth } from './jwt-auth.provider.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, GoogleAuthController, IdentitiesController],
  providers: [
    JwtAuth,
    CredentialsService,
    DrizzleRefreshTokenStore,
    GoogleIdTokenVerifier,
    GoogleSignInService,
    IdentitiesService,
  ],
})
export class AuthModule {}
