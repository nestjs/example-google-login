import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
});
export type SignUpDto = z.infer<typeof signUpSchema>;

// No minimum here: a password set under an older rule still signs in.
export const signInSchema = z.object({
  email: z.email(),
  password: z.string().max(128),
});
export type SignInDto = z.infer<typeof signInSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

// What Google's sign-in libraries hand the client: a signed JWT, a little over 1 KB.
const credential = z.string().min(1).max(4096);

export const googleSignInSchema = z.object({ credential });
export type GoogleSignInDto = z.infer<typeof googleSignInSchema>;

export const connectGoogleSchema = z.object({ credential, password: z.string().max(128) });
export type ConnectGoogleDto = z.infer<typeof connectGoogleSchema>;
