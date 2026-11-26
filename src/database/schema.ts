import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Null for an account created by signing in with Google.
  passwordHash: text('password_hash'),
  createdAt: at('created_at').notNull().defaultNow(),
});

// The accounts at other providers that sign a user in, found by the provider's id for them.
export const identities = pgTable(
  'identities',
  {
    provider: text('provider').notNull(),
    // Google's `sub`: stable for the life of the Google account, unlike its email.
    subject: text('subject').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The address the provider reported, for display only.
    email: text('email'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [
    // One user per provider account: two first sign-ins can't create two users.
    primaryKey({ columns: [table.provider, table.subject] }),
    // One account per provider for each user.
    unique('identities_user_id_provider_key').on(table.userId, table.provider),
  ],
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (table) => [index('notes_owner_id_created_at_idx').on(table.ownerId, table.createdAt)],
);

// What @nestjs/authentication keeps for refresh tokens, stored by their SHA-256.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    familyExpiresAt: at('family_expires_at').notNull(),
    usedAt: at('used_at'),
    // A family is revoked when any of its tokens is.
    revoked: boolean('revoked').notNull().default(false),
    claims: jsonb('claims').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('refresh_tokens_family_id_idx').on(table.familyId),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_expires_at_idx').on(table.familyExpiresAt),
  ],
);

export type Note = typeof notes.$inferSelect;
export type Identity = typeof identities.$inferSelect;
