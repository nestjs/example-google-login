import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { identities, users } from '../database/schema.js';
import type { User } from './user.js';

const columns = { id: users.id, email: users.email, createdAt: users.createdAt };

/** Only `User` objects leave this class: password hashes stay inside. */
@Injectable()
export class UsersRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** The new user, or `null` when the email is taken. */
  async create(email: string, passwordHash: string): Promise<User | null> {
    // One statement: two sign-ups with the same email can't both succeed.
    const [user] = await this.db
      .insert(users)
      .values({ email: normalize(email), passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning(columns);
    return user ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db.select(columns).from(users).where(eq(users.id, id));
    return user ?? null;
  }

  /** For password sign-in only. `passwordHash` is null for an account created with Google. */
  async findCredentials(email: string): Promise<{ user: User; passwordHash: string | null } | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, normalize(email)));
    if (!row) {
      return null;
    }
    const { passwordHash, ...user } = row;
    return { user, passwordHash };
  }

  /** The user that a provider's account signs in. */
  async findByIdentity(provider: string, subject: string): Promise<User | null> {
    const [user] = await this.db
      .select(columns)
      .from(identities)
      .innerJoin(users, eq(users.id, identities.userId))
      .where(and(eq(identities.provider, provider), eq(identities.subject, subject)));
    return user ?? null;
  }

  /** A new user without a password, linked to a provider's account, or `null` when the email is taken. */
  createWithIdentity(email: string, provider: string, subject: string): Promise<User | null> {
    return this.db.transaction(async (tx) => {
      // A concurrent insert of the same email makes this wait for its transaction,
      // and then insert nothing if that one committed.
      const [user] = await tx
        .insert(users)
        .values({ email: normalize(email) })
        .onConflictDoNothing({ target: users.email })
        .returning(columns);
      if (!user) {
        return null;
      }
      await tx.insert(identities).values({ provider, subject, userId: user.id, email });
      return user;
    });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }
}

const normalize = (email: string) => email.trim().normalize('NFC').toLowerCase();
