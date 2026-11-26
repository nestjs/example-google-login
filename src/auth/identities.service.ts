import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '../users/user.js';
import { IdentitiesRepository } from '../users/identities.repository.js';
import { CredentialsService } from './credentials.service.js';
import type { GoogleAccount } from './google-id-token.verifier.js';

@Injectable()
export class IdentitiesService {
  constructor(
    private readonly identitiesRepository: IdentitiesRepository,
    private readonly credentialsService: CredentialsService,
  ) {}

  /** Links a Google account to a signed-in user who confirmed their password. */
  async connectGoogle(user: User, password: string, google: GoogleAccount): Promise<void> {
    if (!(await this.credentialsService.verify(user.email, password))) {
      throw new ForbiddenException('Wrong password');
    }
    if (await this.identitiesRepository.link(user.id, 'google', google.subject, google.email)) {
      return;
    }
    // Not linked: the Google account is this user's already (a retry), someone else's,
    // or this user has another one.
    const owner = await this.identitiesRepository.ownerOf('google', google.subject);
    if (owner !== user.id) {
      throw new ConflictException(
        owner ? 'This Google account is connected to another account' : 'Disconnect your other Google account first',
      );
    }
  }

  async disconnectGoogle(userId: string): Promise<void> {
    if (await this.identitiesRepository.unlink(userId, 'google')) {
      return;
    }
    const accounts = await this.identitiesRepository.list(userId);
    if (!accounts.some(({ provider }) => provider === 'google')) {
      throw new NotFoundException('Google is not connected');
    }
    throw new ConflictException('Google is the only way to sign in to this account');
  }
}
