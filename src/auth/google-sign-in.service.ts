import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';
import type { GoogleAccount } from './google-id-token.verifier.js';

@Injectable()
export class GoogleSignInService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /** The user a Google account signs in, created on its first sign-in. */
  async signIn(google: GoogleAccount): Promise<User> {
    const linked = await this.usersRepository.findByIdentity('google', google.subject);
    if (linked) {
      return linked;
    }
    // A first sign-in. The email becomes the account's, so it must be one Google verified.
    if (!google.email || !google.emailVerified) {
      throw new ForbiddenException('Google has not verified the email address of this account');
    }
    const created = await this.usersRepository.createWithIdentity(google.email, 'google', google.subject);
    if (created) {
      return created;
    }
    // The email is taken. A concurrent first sign-in with this Google account may have
    // just taken it, and then that user is this one.
    const raced = await this.usersRepository.findByIdentity('google', google.subject);
    if (raced) {
      return raced;
    }
    // Someone signed up with this email and a password. Linking now would let them in too.
    throw new ConflictException({
      message: 'An account with this email exists: sign in with its password, then connect Google',
      error: 'Conflict',
      statusCode: 409,
      errorCode: 'link_required',
    });
  }
}
