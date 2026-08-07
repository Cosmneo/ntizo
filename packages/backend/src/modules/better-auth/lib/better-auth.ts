// Better-auth factory for Ntizo. Mirrors flowzao's better-auth module pattern:
// email verification + reset-password wired via a pluggable EmailServicePort.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "../infrastructure/client/drizzle";
import * as schema from "../infrastructure/database/schema";
import { getTrustedOrigins } from "../../../shared/infrastructure/config/stage-properties";
import { infraStore } from "../../../shared/infrastructure/stores/infra-store";
import type { EmailServicePort } from "../../../shared/infrastructure/email";
import {
  verifyEmailTemplate,
  resetPasswordTemplate,
} from "../../../shared/infrastructure/email";

export interface SignUpHookInput {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}
export type SignUpHook = (input: SignUpHookInput) => Promise<void>;

let _auth: ReturnType<typeof createAuthInstance> | undefined;
let _emailService: EmailServicePort | undefined;
let _signUpHook: SignUpHook | undefined;

/**
 * Registers the email service for better-auth's email hooks.
 * Must be called during api bootstrap, before the first auth request.
 */
export function registerEmailService(service: EmailServicePort) {
  _emailService = service;
}

/**
 * Registers a sign-up hook called after better-auth creates an auth user.
 * The hook is responsible for materialising the domain Profile in `ntizo_user.profile`.
 * If the hook throws, the auth user is deleted (compensation) so signup is retryable.
 */
export function registerSignUpHook(hook: SignUpHook) {
  _signUpHook = hook;
}

function requireEmailService(): EmailServicePort {
  if (!_emailService) {
    throw new Error(
      "[better-auth] EmailService not registered. " +
        "Call registerEmailService() during api bootstrap.",
    );
  }
  return _emailService;
}

function createAuthInstance() {
  const env = infraStore.getEnv();

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: getTrustedOrigins(env.STAGE),
    database: drizzleAdapter(db, { provider: "pg", schema }),
    user: {
      additionalFields: {
        firstName: { type: "string", required: false, defaultValue: "" },
        lastName: { type: "string", required: false, defaultValue: "" },
        role: { type: "string", required: false, defaultValue: "customer" },
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const svc = requireEmailService();
        const tpl = verifyEmailTemplate(url);
        await svc.sendEmail({
          to: [user.email],
          subject: tpl.subject,
          htmlBody: tpl.html,
          textBody: tpl.text,
        });
      },
    },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              mapProfileToUser: (profile: { given_name?: string; family_name?: string }) => ({
                firstName: profile.given_name ?? "",
                lastName: profile.family_name ?? "",
              }),
            },
          }
        : {}),
      ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
        ? {
            microsoft: {
              clientId: env.MICROSOFT_CLIENT_ID,
              clientSecret: env.MICROSOFT_CLIENT_SECRET,
              mapProfileToUser: (profile: { given_name?: string; family_name?: string }) => ({
                firstName: profile.given_name ?? "",
                lastName: profile.family_name ?? "",
              }),
            },
          }
        : {}),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        const svc = requireEmailService();
        const tpl = resetPasswordTemplate(url);
        await svc.sendEmail({
          to: [user.email],
          subject: tpl.subject,
          htmlBody: tpl.html,
          textBody: tpl.text,
        });
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (authUser) => {
            if (!_signUpHook) return;
            const u = authUser as Record<string, unknown>;
            try {
              await _signUpHook({
                userId: authUser.id,
                email: authUser.email,
                firstName: (u.firstName as string) ?? "",
                lastName: (u.lastName as string) ?? "",
              });
            } catch (error) {
              // Compensation: delete the auth user so the next signup attempt isn't blocked.
              try {
                await db
                  .delete(schema.user)
                  .where(eq(schema.user.id, authUser.id));
              } catch {
                // swallow — the original error is what the client should see
              }
              throw error;
            }
          },
        },
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 60 },
    },
    advanced: {
      // In non-local stages, widen the session cookie to the root domain so
      // landing / admin / provider subdomains share the same session.
      // In local dev, all apps hit localhost:8788 directly and cookies are
      // already shared via the bare `localhost` host, so no override needed.
      ...(env.STAGE !== "local"
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: "ntizo.com",
            },
            defaultCookieAttributes: {
              sameSite: "none" as const,
              secure: true,
            },
          }
        : {}),
    },
  });
}

export function getAuth() {
  if (!_auth) _auth = createAuthInstance();
  return _auth;
}
