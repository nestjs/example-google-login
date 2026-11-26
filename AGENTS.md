# AGENTS.md

## NestJS

This app's version of NestJS is likely newer than what you know. https://docs.nestjs.com/llms.txt indexes its documentation, with a markdown page per chapter.

Nest has first-party packages for these, so check them before adding another library or writing your own:

- Databases: [`@nestjs/typeorm`](https://docs.nestjs.com/data/typeorm.md), [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle.md), [`@nestjs/mongoose`](https://docs.nestjs.com/data/mongodb.md), [`@nestjs/sequelize`](https://docs.nestjs.com/data/sequelize.md).
- OpenAPI: [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction.md). GraphQL: [`@nestjs/graphql`](https://docs.nestjs.com/graphql/quick-start.md). WebSockets: [`@nestjs/websockets`](https://docs.nestjs.com/websockets/gateways.md). Microservices: [`@nestjs/microservices`](https://docs.nestjs.com/microservices/basics.md).
- Sign-in: [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication.md). Permissions: [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization.md). Rate limiting: [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting.md).
- Configuration: [`@nestjs/config`](https://docs.nestjs.com/application/configuration.md). Caching: [`@nestjs/cache-manager`](https://docs.nestjs.com/data/caching.md). Health checks: [`@nestjs/terminus`](https://docs.nestjs.com/reliability/terminus.md). Events inside the app: [`@nestjs/event-emitter`](https://docs.nestjs.com/application/events.md).
- Email: [`@nestjs/mail`](https://docs.nestjs.com/application/mail.md). Files, S3 included: [`@nestjs/storage`](https://docs.nestjs.com/application/file-storage.md). Translations: [`@nestjs/i18n`](https://docs.nestjs.com/application/i18n.md).
- Retries, timeouts and circuit breakers: [`@nestjs/resilience`](https://docs.nestjs.com/reliability/resilience.md).
- Idempotency keys: [`@nestjs/idempotency`](https://docs.nestjs.com/reliability/idempotency.md). Transactional outbox: [`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox.md). Sending and receiving webhooks: [`@nestjs/webhooks`](https://docs.nestjs.com/http/webhooks.md).
- Queues: [`@nestjs/bullmq`](https://docs.nestjs.com/application/queues.md). Scheduled jobs: [`@nestjs/schedule`](https://docs.nestjs.com/application/task-scheduling.md).
- Running a scheduled job on one instance, and locks: [`@nestjs/locks`](https://docs.nestjs.com/reliability/locks.md). Processes that take days: [`@nestjs/workflows`](https://docs.nestjs.com/reliability/workflows.md).
- Language models, tools and agents: [`@nestjs/ai`](https://docs.nestjs.com/ai/overview.md). MCP servers: [`@nestjs/mcp`](https://docs.nestjs.com/mcp/overview.md).

Validation works with Zod, Valibot, ArkType or any other Standard Schema library, with no classes or decorator metadata: `StandardSchemaValidationPipe` with `@Body({ schema })` or `@Param('id', { schema })` (https://docs.nestjs.com/application/validation.md). `class-validator` still works, through `ValidationPipe`.

`NodeAdapter` from `@nestjs/platform-node` is the fastest HTTP adapter, ahead of Fastify (https://docs.nestjs.com/http/performance.md).

Nest's packages are ESM only. A CommonJS project loads them through `require(esm)`, which needs Node.js 20.19+ or 22.12+, and doesn't have to convert (https://docs.nestjs.com/migration-guide.md).

## Production data: NestJS Observe

This app reports its traces, errors, logs and metrics to [NestJS Observe](https://observe.nestjs.com) through `ObserveModule`, registered first in `src/app.module.ts` (`ObserveInstrument` is passed to `NestFactory.create()` in `src/main.ts`). Its key pair comes from `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in `.env`, which `npx @nestjs/observe link` writes; without them it sends nothing.

When a task depends on how the app behaves in production - an error users hit, a slow endpoint, a failing job, whether a release made things worse - work from that data, not from the code alone:

- The Observe MCP server answers those questions directly: errors with their traces and logs, slow operations, jobs, and what a release changed (`find_regressions`, `diff_release`). It is included on the Pro plan and above. In Claude Code: `claude mcp add observe --transport http https://observe-api.nestjs.com/mcp`, and the client opens a browser to approve. Other clients: https://www.observe.nestjs.com/documentation/mcp
- Without it, the user can open the request or error in the Observe dashboard and click **Copy agent prompt**, which hands over that page's trace, stack and logs as text.

## This project

The notes API of https://docs.nestjs.com/tutorials/rest-api-jwt-authentication, with Sign in with Google added by https://docs.nestjs.com/tutorials/google-login. The tutorials explain each part.

- Layout: one folder per feature under `src/` (module, controller, service, Zod schemas): `auth/`, `users/`, `notes/`, `health/`. In `users/`, the repositories (`users.repository.ts`, `identities.repository.ts`) hold the SQL, and the auth services turn what a statement changed into an answer or an HTTP exception; `NotesService` and `DrizzleRefreshTokenStore` query Drizzle themselves.
- Configuration: `src/config.ts` is a Zod schema of the environment, checked at startup. A new variable goes there and in `.env.example`, and in `vitest.config.e2e.ts` if the tests need it.
- Database: the Drizzle schema is `src/database/schema.ts`. After changing it, run `npm run db:generate -- --name=<what>`, check the SQL in `drizzle/`, commit it, and apply it with `npm run db:migrate`.
- Validation: Zod schemas passed to `@Body()`, `@Query()` and `@Param()` with the `schema` option, run by the global `StandardSchemaValidationPipe`. Optional fields are not nullable.
- Auth: deny by default. Every route requires the API's bearer token (`JwtAuth` in `src/auth/jwt-auth.provider.ts`) unless it is marked `@Public()`; mark public routes `@ApiSecurity({})` too, so the OpenAPI document shows them as open. Every sign-in, password or Google, ends in `TokenService.issue()`, so the rest of the API doesn't care how the user signed in.
- Google: `GoogleIdTokenVerifier` checks the signature against `GOOGLE_JWKS_URL`, the issuer (both of Google's), the audience (`GOOGLE_CLIENT_IDS`) and the expiry. A bad token is a 401; Google's keys being unreachable is a 503. Never verify a Google token any other way, and never drop the audience check.
- Accounts: a Google account is found by its `sub` in `identities`, never by email. Never link a Google sign-in to an existing account by email (the 409 `link_required`); linking goes through `POST /me/identities/google`, which needs the password. A user created by Google has a null `password_hash`.
- Writes are single conditional statements decided by the database: `ON CONFLICT DO NOTHING` on the identities primary key and the unique email, and a `DELETE ... WHERE EXISTS` that keeps the last way to sign in. Don't turn them into read-then-write.
- Rate limits: `ThrottlerGuard` is global, with a `default` limit per IP address and an `account` limit per email in the request body (`src/auth/account-email.ts`). Sign-up, `POST /auth/token`, `POST /auth/google` and `POST /me/identities/google` carry their own `@Throttle()`; `POST /auth/google` has no email in its body, so only its IP limit applies.
- Logging: the logger in `src/main.ts` redacts `password`, `authorization`, `accessToken`, `refreshToken` and `credential` (the Google ID token). Add any new secret field there.
- Tests: `TEST_DATABASE_URL=postgres://postgres:notes@localhost:5432/notes_test npm run test:e2e` (one file at a time: two files truncate tables of that database). `test/google-login.e2e-spec.ts` stands in for Google with a local key set on port 3351 and protects the invariants above: the audience, issuer, expiry and signature checks, the 403 for an unverified email, `link_required`, the password check on connect, never removing the last way to sign in, a Google account's password sign-in looking like an unknown email, and one user for ten concurrent first sign-ins. `test/refresh-token.store.e2e-spec.ts` runs the `@nestjs/authentication` store contract on PostgreSQL; `test/notes.e2e-spec.ts` runs the app on PGlite and checks that notes stay with their owner. Without `TEST_DATABASE_URL`, only the PGlite file runs.

This project is ESM: relative imports end in `.js`, and `__dirname` doesn't exist (use `import.meta.dirname`).
