import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, exists, isNotNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { identities, users, type Identity } from '../database/schema.js';

export type ConnectedAccount = Pick<Identity, 'provider' | 'email' | 'createdAt'>;

const columns = { provider: identities.provider, email: identities.email, createdAt: identities.createdAt };

/** The provider accounts connected to a user. */
@Injectable()
export class IdentitiesRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  list(userId: string): Promise<ConnectedAccount[]> {
    return this.db.select(columns).from(identities).where(eq(identities.userId, userId)).orderBy(asc(identities.provider));
  }

  /** Whose the provider account is: the user it is linked to, or `undefined`. */
  async ownerOf(provider: string, subject: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ userId: identities.userId })
      .from(identities)
      .where(and(eq(identities.provider, provider), eq(identities.subject, subject)));
    return row?.userId;
  }

  /** Whether the link was made: not when the provider account, or the user's account at the provider, is linked already. */
  async link(userId: string, provider: string, subject: string, email?: string): Promise<boolean> {
    // The constraints decide, so of two concurrent links of one account, one succeeds.
    const linked = await this.db
      .insert(identities)
      .values({ userId, provider, subject, email })
      .onConflictDoNothing()
      .returning({ provider: identities.provider });
    return linked.length > 0;
  }

  /** Whether the link was removed. Never the user's last way to sign in: a user without a password keeps it. */
  async unlink(userId: string, provider: string): Promise<boolean> {
    const hasPassword = this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNotNull(users.passwordHash)));
    // One statement: the check and the delete can't be separated by another request.
    const removed = await this.db
      .delete(identities)
      .where(and(eq(identities.userId, userId), eq(identities.provider, provider), exists(hasPassword)))
      .returning({ provider: identities.provider });
    return removed.length > 0;
  }
}
