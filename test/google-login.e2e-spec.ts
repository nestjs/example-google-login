import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { JwtSigner, PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { identities, users } from '../src/database/schema.js';

// A real PostgreSQL with a pool, so concurrent sign-ins really race.
const url = process.env.TEST_DATABASE_URL;

// Stands in for Google: a key pair, and its public half served as a JWKS.
const google = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key';

/** An ID token shaped like Google's, signed with the test key unless `key` says otherwise. */
function idToken(
  claims: { sub: string; email?: string; email_verified?: boolean },
  { key = google.privateKey as KeyObject, issuer = 'https://accounts.google.com', audience = 'web-client.apps.googleusercontent.com', now = Date.now } = {},
) {
  return new JwtSigner({ key, kid: KID, issuer, audience, ttl: '1h', now }).sign({ email_verified: true, ...claims });
}

describe.skipIf(!url)('Google login (e2e)', () => {
  const pool = new Pool({ connectionString: url, max: 20 });
  const db = drizzle({ client: pool });
  const jwks = createServer((_req, res) => {
    const jwk = google.publicKey.export({ format: 'jwk' });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }));
  });
  let app: NestNodeApplication;

  beforeAll(async () => {
    await new Promise<void>((resolve) => jwks.listen(3351, '127.0.0.1', resolve));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, identities, refresh_tokens CASCADE`);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db)
      // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    await app.init();
  });

  afterAll(async () => {
    await app.close(); // closes the pool too
    jwks.close();
  });

  let clients = 0;
  // Each request from an address of its own: sign-in and sign-up are rate-limited per IP address.
  const from = () => `10.0.0.${++clients}`;

  const signInWithGoogle = (credential: string) =>
    app.inject({ method: 'POST', url: '/auth/google', payload: { credential }, remoteAddress: from() });

  /** The user that a sign-in's access token belongs to. */
  async function me(signIn: { json<T>(): T }) {
    const { accessToken } = signIn.json<{ accessToken: string }>();
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${accessToken}` } });
    return res.json<{ id: string; email: string }>();
  }

  it('signs a new Google user up, then back in', async () => {
    const first = await signInWithGoogle(idToken({ sub: 'google-ada', email: 'Ada@gmail.com' }));
    expect(first.statusCode).toBe(200);
    const ada = await me(first);
    expect(ada.email).toBe('ada@gmail.com');

    // The other documented issuer, and another of the API's client IDs, work too.
    const again = await signInWithGoogle(
      idToken({ sub: 'google-ada' }, { issuer: 'accounts.google.com', audience: 'mobile-client.apps.googleusercontent.com' }),
    );
    expect(await me(again)).toEqual(ada);
  });

  it('refuses ID tokens that are not for this API', async () => {
    const tokens = {
      'unexpected audience': idToken({ sub: 'google-eve' }, { audience: 'someone-elses.apps.googleusercontent.com' }),
      'unexpected issuer': idToken({ sub: 'google-eve' }, { issuer: 'https://accounts.example.com' }),
      'token expired': idToken({ sub: 'google-eve' }, { now: () => Date.now() - 2 * 60 * 60 * 1000 }),
      'invalid signature': idToken({ sub: 'google-eve' }, { key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }),
    };
    for (const [reason, token] of Object.entries(tokens)) {
      const res = await signInWithGoogle(token);
      expect(res.json()).toMatchObject({ statusCode: 401, message: `Invalid Google ID token: ${reason}` });
    }
    const unverified = idToken({ sub: 'google-eve', email: 'mallory@example.com', email_verified: false });
    expect((await signInWithGoogle(unverified)).statusCode).toBe(403);
  });

  /** Signs up with a password, and returns the headers that authenticate as the new user. */
  async function signUp(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, password: 'correct horse battery' },
      remoteAddress: from(),
    });
    return { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
  }

  it('never links a Google account to a password account by email', async () => {
    const headers = await signUp('bob@gmail.com');
    const credential = idToken({ sub: 'google-bob', email: 'bob@gmail.com' });

    const refused = await signInWithGoogle(credential);
    expect(refused.json()).toMatchObject({ statusCode: 409, errorCode: 'link_required' });

    const connect = (as: Record<string, string>, token: string, password = 'correct horse battery') =>
      app.inject({ method: 'POST', url: '/me/identities/google', headers: as, payload: { credential: token, password }, remoteAddress: from() });
    expect((await connect(headers, credential, 'a wrong guess')).statusCode).toBe(403);
    expect((await connect(headers, credential)).statusCode).toBe(204);
    expect((await connect(headers, credential)).statusCode).toBe(204); // a retry
    expect((await me(await signInWithGoogle(credential))).email).toBe('bob@gmail.com');

    // Bob's Google account is his, and he has one already.
    const taken = await connect(await signUp('dan@gmail.com'), credential);
    expect(taken.json().message).toBe('This Google account is connected to another account');
    const second = await connect(headers, idToken({ sub: 'google-bob-2' }));
    expect(second.json().message).toBe('Disconnect your other Google account first');

    // Bob has a password, so Google can go, once. Ada has nothing else.
    const disconnect = (as: Record<string, string>) => app.inject({ method: 'DELETE', url: '/me/identities/google', headers: as });
    expect((await disconnect(headers)).statusCode).toBe(204);
    expect((await disconnect(headers)).statusCode).toBe(404);
    const ada = await signInWithGoogle(idToken({ sub: 'google-ada' }));
    const asAda = { authorization: `Bearer ${ada.json<{ accessToken: string }>().accessToken}` };
    expect((await disconnect(asAda)).statusCode).toBe(409);
  });

  it('refuses a password sign-in to an account created with Google', async () => {
    const signIn = (email: string) =>
      app.inject({ method: 'POST', url: '/auth/token', payload: { email, password: 'any password at all' }, remoteAddress: from() });
    const created = await signIn('ada@gmail.com');
    expect(created.statusCode).toBe(401);
    expect(created.json()).toEqual((await signIn('nobody@gmail.com')).json());
  });

  it('creates one user when the same Google account signs in twice at once', async () => {
    const credential = idToken({ sub: 'google-carol', email: 'carol@gmail.com' });
    // Opens the pool's connections first, or the first request finishes while the others wait for theirs.
    await Promise.all(Array.from({ length: 10 }, () => pool.query('SELECT 1')));

    const results = await Promise.all(Array.from({ length: 10 }, () => signInWithGoogle(credential)));

    expect(results.map((res) => res.statusCode)).toEqual(Array(10).fill(200));
    const ids = new Set((await Promise.all(results.map(me))).map(({ id }) => id));
    expect(ids.size).toBe(1);
    expect(await db.$count(users, eq(users.email, 'carol@gmail.com'))).toBe(1);
    expect(await db.$count(identities, eq(identities.subject, 'google-carol'))).toBe(1);
  });
});
