import { resolveLocale, type Locale } from "@ntizo/shared";
// Better-auth factory for Ntizo. Mirrors flowzao's better-auth module pattern:
// email verification + reset-password wired via a pluggable EmailServicePort.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { isValidPhoneNumber } from "libphonenumber-js";
import { normalizeSignUpPhoneNumber } from "./phone-number";
import { eq } from "drizzle-orm";
import { db } from "../infrastructure/client/drizzle";
import * as schema from "../infrastructure/database/schema";
import {
  getStageProperties,
  getTrustedOrigins,
} from "../../../shared/infrastructure/config/stage-properties";
import { infraStore } from "../../../shared/infrastructure/stores/infra-store";
import type { EmailServicePort } from "../../../shared/infrastructure/email";
import {
  verifyEmailTemplate,
  resetPasswordTemplate,
} from "../../../shared/infrastructure/email";
import type { SmsServicePort } from "../../../shared/infrastructure/sms";
import { verifyPhoneTemplate } from "../../../shared/infrastructure/sms";

export interface SignUpHookInput {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /**
   * In E.164, or null when the user signed up without one (social login).
   *
   * Passed through so the domain Profile carries the same number better-auth
   * stores. Without it the two disagreed from the first second: the auth user
   * had a verified phone and the profile had none, so the account page told a
   * user who had just confirmed their number that it was unverified.
   */
  phoneNumber: string | null;
  /**
   * The language the request was made in, resolved to a supported Locale.
   *
   * Signup is the only moment this is knowable — the request carries it and
   * nothing downstream has one — so it travels with the rest of the profile
   * rather than being looked up later.
   */
  language?: Locale;
}
export type SignUpHook = (input: SignUpHookInput) => Promise<void>;

let _auth: ReturnType<typeof createAuthInstance> | undefined;
let _emailService: EmailServicePort | undefined;
let _smsService: SmsServicePort | undefined;
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

/**
 * Registers the SMS service used to deliver phone-verification codes.
 * Must be called during api bootstrap, before the first OTP request.
 */
export function registerSmsService(service: SmsServicePort) {
  _smsService = service;
}

function requireSmsService(): SmsServicePort {
  if (!_smsService) {
    throw new Error(
      "[better-auth] SmsService not registered. " +
        "Call registerSmsService() during api bootstrap.",
    );
  }
  return _smsService;
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
  const { cookieDomain } = getStageProperties(env.STAGE);

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: getTrustedOrigins(env.STAGE),
    // `transaction: false` is passed EXPLICITLY, and must stay that way.
    //
    // It makes @better-auth/core use `createAsIsTransaction`, a passthrough
    // that opens no real Postgres transaction. That is the ONLY reason the
    // `user.create.after` hook below (which drives our own
    // `unitOfWork.atomicExecute`) doesn't deadlock: our app pool is capped
    // at `{ max: 1 }` (see shared/infrastructure/database/connection.ts), so
    // if better-auth ever opened a real transaction here it would hold that
    // single connection while our hook's `atomicExecute` queues forever for
    // one — a silent, permanent hang with no timeout to break it
    // (`connect_timeout` only covers the initial socket, not this queue).
    //
    // Passing it beats omitting it: the adapter's default is `false` today,
    // but relying on that makes the safety a property of a third-party
    // version rather than of this file. `better-auth` is also pinned exactly
    // in package.json, but a pin is discipline and this is structure — a
    // routine bump cannot reach it.
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: false }),
    plugins: [
      phoneNumber({
        // Both values are passed explicitly even though they match the
        // plugin's defaults, because two things outside this file depend on
        // them: the SMS body says "expires in 5 minutes", and the
        // verification screen renders a fixed number of input boxes. A default
        // that shifted in a version bump would make the copy lie and the UI
        // unfillable, with nothing failing loudly.
        otpLength: 6,
        expiresIn: 300,
        sendOTP: async ({ phoneNumber: to, code }) => {
          const svc = requireSmsService();
          await svc.sendSms({ to, body: verifyPhoneTemplate(code) });
        },
        // Called with no default country, so a bare national number is
        // rejected and only E.164 (`+258…`) passes.
        //
        // This guards the plugin's own routes (send-otp, update) ONLY. It is
        // NOT reached during signup, where the number arrives as an ordinary
        // additional field — verified against the running server, which
        // happily stored a bare "841234567" until the create hook below was
        // added. Both are needed; neither covers the other.
        phoneNumberValidator: (value) => isValidPhoneNumber(value),
        // Deliberately false: sign-in must not depend on phone verification.
        // No SMS provider is configured yet (see resolveSmsService in the api
        // bootstrap), so requiring it would lock every account out of the
        // platform the moment this deploys.
        requireVerification: false,
      }),
    ],
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
        // Same source as the profile's own language, and for the same
        // reason: this fires during the signup request, so the header is
        // there. It is also the only signal available — the profile does not
        // exist yet when this runs.
        const tpl = verifyEmailTemplate(url, resolveLocale(infraStore.getAcceptLanguage()));
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
        // The language of the browser asking for the reset, not the one
        // stored on the profile. Somebody who has switched device or language
        // reads the mail where they asked for it.
        const tpl = resetPasswordTemplate(url, resolveLocale(infraStore.getAcceptLanguage()));
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
          /**
           * Validates and normalises the phone number at signup.
           *
           * The plugin's `phoneNumberValidator` never runs here — signup
           * writes `phoneNumber` as a plain additional field — so without
           * this the API accepts any string. Client-side validation does not
           * substitute: it is one curl away from being skipped.
           *
           * Normalising matters as much as validating. `isValidPhoneNumber`
           * accepts "+258 84 987 6543", and storing it verbatim would sit
           * alongside "+258849876543" as a second row for one phone, which
           * the unique index cannot catch because the strings differ.
           */
          before: async (authUser) => {
            const raw = (authUser as Record<string, unknown>).phoneNumber;
            const normalized = normalizeSignUpPhoneNumber(raw);
            if (normalized === undefined) return;
            return { data: { ...authUser, phoneNumber: normalized } };
          },
          after: async (authUser) => {
            if (!_signUpHook) return;
            const u = authUser as Record<string, unknown>;
            try {
              await _signUpHook({
                userId: authUser.id,
                email: authUser.email,
                firstName: (u.firstName as string) ?? "",
                lastName: (u.lastName as string) ?? "",
                // Already normalised to E.164 by the create.before hook above,
                // so the profile and the auth user store the same string.
                phoneNumber: (u.phoneNumber as string | undefined) ?? null,
                // Resolved here rather than inside the user context, which has
                // no request to read. The web app overrides the browser's own
                // Accept-Language with whatever the language switcher says, so
                // this is the language on screen, not the one the OS was
                // installed in.
                language: resolveLocale(infraStore.getAcceptLanguage()),
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
      // the app and the api subdomain share one session.
      // In local dev, all apps hit localhost:8788 directly and cookies are
      // already shared via the bare `localhost` host, so no override needed.
      //
      // The domain comes from the stage rather than a literal here. It used
      // to read "ntizo.com" while every URL had moved to ntizo.co.mz — and a
      // browser refuses a cookie for a domain it is not visiting, so sign-in
      // would have appeared to work and the session would have vanished on
      // the next request, logging nothing. Local never applies this block, so
      // no test could have caught it.
      ...(cookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: cookieDomain,
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
