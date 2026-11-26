import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      DATABASE_URL: 'postgres://unused-in-tests',
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
      GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com,mobile-client.apps.googleusercontent.com',
      // The key set test/google-login.e2e-spec.ts serves.
      GOOGLE_JWKS_URL: 'http://127.0.0.1:3351/certs',
    },
  },
});
