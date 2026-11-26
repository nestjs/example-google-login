# Notes API with Google login: a NestJS API that signs users in with Google ID tokens

This is the finished application of the tutorial [Add Google login to a Node.js API](https://docs.nestjs.com/tutorials/google-login) in the NestJS documentation. The tutorial builds it step by step and explains each decision; this repository holds the result.

It continues the notes API of [Build a REST API with JWT authentication](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication) ([nestjs/example-rest-api-jwt-authentication](https://github.com/nestjs/example-rest-api-jwt-authentication)), and adds Sign in with Google to it.

## What it does

The API stores personal notes. Users sign up with an email and a password, or sign in with Google, and get the API's own 15-minute JWT access token and a refresh token. They read and write only their own notes.

- `POST /auth/google` takes the ID token that Google's sign-in library hands the web or mobile app, and verifies it with `JwtVerifier` from [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication): the signature against Google's published keys, the issuer, the audience (your OAuth client IDs) and the expiry. It answers with the same tokens as a password sign-in.
- A first Google sign-in creates an account, but only for an email Google verified. The link between the Google account and the user is a row in `identities`, keyed by Google's `sub`, never by the email.
- A Google sign-in with the email of an existing password account is refused with a 409 and `errorCode: "link_required"` (account pre-hijacking). The owner signs in with their password and connects Google with `POST /me/identities/google`, which asks for the password again.
- `DELETE /me/identities/google` never removes the last way to sign in to an account.
- Concurrent first sign-ins of one Google account create one user.
- An account created with Google has no password, and a password sign-in to it gets the same 401 as an unknown email.
- From the JWT tutorial: rotating refresh tokens, Zod validation of requests and of the environment, rate limits, security headers and CORS, an OpenAPI document with Swagger UI, health checks, and JSON logs in production with passwords, tokens and ID tokens masked.
- NestJS Observe wired in, sending nothing until you link the project.

## Run it

You need Node.js 22 or later, and Docker for PostgreSQL.

```bash
git clone https://github.com/nestjs/example-google-login.git
cd example-google-login
npm install
cp .env.example .env    # then set JWT_SECRET (openssl rand -base64 32) and GOOGLE_CLIENT_IDS
docker compose up -d
npm run db:migrate
npm run start:dev
```

The API listens on http://localhost:3000, with Swagger UI at http://localhost:3000/docs. It refuses to start without at least one client ID in `GOOGLE_CLIENT_IDS`; the placeholder in `.env.example` lets it start, but no real Google token is issued to it.

### Get a Google client ID

The ID tokens are issued to an OAuth client of yours, in the [Google Cloud console](https://console.cloud.google.com/). The tutorial's [Set up a Google OAuth client](https://docs.nestjs.com/tutorials/google-login#set-up-a-google-oauth-client) has the steps:

1. In **Google Auth Platform**, fill in the **Branding** page.
2. On the **Clients** page, create a client of type **Web application**.
3. Under **Authorized JavaScript origins**, add `http://localhost` and `http://localhost:5173`.
4. Copy the client ID, which ends in `.apps.googleusercontent.com`, into `GOOGLE_CLIENT_IDS` in `.env`. The API doesn't need the client secret.

Mobile apps' client IDs go in the same variable, comma-separated, after the web one.

### Sign in from the browser

`web/index.html` is a minimal page of the web app: Google's button, and a callback that posts the ID token to `POST /auth/google`. Set `GOOGLE_CLIENT_ID` in it to your web client ID, then serve it on the origin that `.env.example` puts in `CORS_ORIGINS`:

```bash
python3 -m http.server 5173 -d web
```

Open http://localhost:5173 and sign in.

## Endpoints

| Endpoint | Auth | Tutorial section |
| --- | --- | --- |
| `POST /auth/google` | public | [Sign in with a Google ID token](https://docs.nestjs.com/tutorials/google-login#sign-in-with-a-google-id-token) |
| `GET /me/identities`, `POST /me/identities/google`, `DELETE /me/identities/google` | bearer token | [Connect Google to an existing account](https://docs.nestjs.com/tutorials/google-login#connect-google-to-an-existing-account) |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke` | public | [Sign users in with JWTs](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) (JWT tutorial) |
| `GET /me` | bearer token | [Sign users in with JWTs](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) (JWT tutorial) |
| `GET /notes`, `GET /notes/:id`, `POST /notes`, `PATCH /notes/:id`, `DELETE /notes/:id` | bearer token, owner only | [Store notes in PostgreSQL](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication#store-notes-in-postgresql) (JWT tutorial) |
| `GET /docs` | public | [Describe the API with OpenAPI](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication#describe-the-api-with-openapi) (JWT tutorial) |
| `GET /health/live`, `GET /health/ready` | public | [Add health checks](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication#add-health-checks) (JWT tutorial) |

`POST /auth/google` takes `{ "credential": "<ID token>" }`. `POST /me/identities/google` takes `{ "credential": "<ID token>", "password": "<the account's password>" }`. The answers to each case (401, 403, 409, 503) are in the tutorial's [Try it](https://docs.nestjs.com/tutorials/google-login#try-it).

## Layout

| Path | What it holds |
| --- | --- |
| `src/main.ts` | bootstrap on the Node adapter: logger, security headers, CORS, Swagger UI, shutdown hooks |
| `src/app.module.ts` | NestJS Observe, config, database, authentication, throttler, the global validation pipe |
| `src/config.ts` | the environment, as a Zod schema checked at startup |
| `src/database/schema.ts` | Drizzle tables: users, identities, notes, refresh_tokens |
| `src/auth/google-id-token.verifier.ts` | verifies Google ID tokens against Google's key set |
| `src/auth/google-sign-in.service.ts`, `google-auth.controller.ts` | `POST /auth/google`: which user a Google account signs in |
| `src/auth/identities.service.ts`, `identities.controller.ts` | connecting and disconnecting Google |
| `src/auth/` (the rest) | sign-up and token endpoints, the JWT bearer provider, password checks, the refresh-token store |
| `src/users/` | the users and identities repositories, and `GET /me` |
| `src/notes/` | the notes resource, scoped to its owner |
| `src/health/` | liveness and readiness |
| `drizzle/` | migrations |
| `test/` | end-to-end tests |
| `web/index.html` | the Sign in with Google page of the web app |

## Tests

```bash
TEST_DATABASE_URL=postgres://postgres:notes@localhost:5432/notes_test npm run test:e2e
```

The tests never call Google. `test/google-login.e2e-spec.ts` stands in for it: it generates an RSA key pair, serves the public half as a key set on `127.0.0.1:3351` (where `vitest.config.e2e.ts` points `GOOGLE_JWKS_URL`), and signs ID tokens with Google's claims. It covers sign-up and return sign-in, refused tokens, the `link_required` case, connecting and disconnecting, and ten concurrent first sign-ins creating one user. It and `test/refresh-token.store.e2e-spec.ts` need real PostgreSQL, and are skipped when `TEST_DATABASE_URL` isn't set. `test/notes.e2e-spec.ts` runs on [PGlite](https://pglite.dev) and needs no server.

`docker compose` creates the `notes_test` database. The tests truncate its tables, so never point them at your development database. They run one file at a time (`--no-file-parallelism`), since two files share that database.

## Stack

[NestJS](https://nestjs.com) 12 on the Node adapter, [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication) (`JwtVerifier` and `JwksClient` for Google's tokens, `TokenService` for the API's own), [Zod](https://zod.dev) with `StandardSchemaValidationPipe`, [`@nestjs/config`](https://docs.nestjs.com/application/configuration), [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) with PostgreSQL 17, [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting), [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction), [`@nestjs/terminus`](https://docs.nestjs.com/reliability/terminus), [NestJS Observe](https://docs.nestjs.com/observability/overview), Google Identity Services on the web page, and Vitest with PGlite.

## Production

Read the tutorial's [production checklist](https://docs.nestjs.com/tutorials/google-login#production-checklist) first, and the JWT tutorial's [checklist](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication#production-checklist) it builds on.

The app is wired to [NestJS Observe](https://docs.nestjs.com/observability/overview), and sends nothing until it has a key pair: `npx @nestjs/observe link` writes `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` into `.env`. In production, set them in the platform's environment, since `start:prod` doesn't load `.env`. Observe records requests per route with their failure rate, so a rise in 401s on `POST /auth/google` (for example, a mobile release using a client ID the API doesn't list) shows up there.

## License

MIT
