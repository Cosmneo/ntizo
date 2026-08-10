// Bootstraps shared infrastructure adapters and registers them with modules
// that need them (e.g. better-auth's email hooks). Must be imported once,
// before the first auth request is handled.
//
// Workers only expose env bindings inside a request scope: configMiddleware
// populates infraStore via AsyncLocalStorage around each request, and
// infraStore.getEnv() throws outside that scope. This module runs at module
// scope — once per isolate, before any request exists — so it cannot decide
// which concrete email adapter to use yet. Instead it registers an adapter
// that defers the STAGE / RESEND_API_KEY decision to send time, when a
// request scope is guaranteed to be active.

import {
  ConsoleEmailServiceAdapter,
  ResendEmailServiceAdapter,
  type EmailMessage,
  type EmailServicePort,
} from "@ntizo/backend/shared/infra/email";
import {
  ConsoleSmsServiceAdapter,
  type SmsMessage,
  type SmsServicePort,
} from "@ntizo/backend/shared/infra/sms";
import { registerEmailService, registerSmsService } from "@ntizo/backend/modules/better-auth";
import { infraStore } from "@ntizo/backend/shared/infra";

/**
 * Picks the concrete adapter from the request-scoped env. Must only be
 * called from inside a request (i.e. after configMiddleware has run) —
 * infraStore.getEnv() throws otherwise.
 */
function resolveEmailService(): EmailServicePort {
  const env = infraStore.getEnv();
  const stage = env.STAGE ?? "local";
  const hasResendKey = Boolean(env.RESEND_API_KEY);

  if (hasResendKey) return new ResendEmailServiceAdapter();

  // Fail fast rather than silently dropping mail. Without this, a deployed
  // stage missing RESEND_API_KEY accepts signups and then strands every user
  // unverifiable, because better-auth swallows send failures into a log line.
  if (stage !== "local") {
    throw new Error(
      `[bootstrap] RESEND_API_KEY is required when STAGE="${stage}". ` +
        "Set it, or run with STAGE=local to print emails to the console.",
    );
  }

  console.info(
    "[bootstrap] No RESEND_API_KEY — using the console email adapter. " +
      "Verification and reset links will be printed to this terminal.",
  );
  return new ConsoleEmailServiceAdapter();
}

/**
 * Registered once at module scope, but resolves + delegates to the real
 * adapter on every send — so the STAGE / RESEND_API_KEY check always runs
 * against the current request's env, never a stale or absent one.
 */
class LazyEmailServiceAdapter implements EmailServicePort {
  async sendEmail(message: EmailMessage): Promise<void> {
    const service = resolveEmailService();
    await service.sendEmail(message);
  }
}

const emailService = new LazyEmailServiceAdapter();
registerEmailService(emailService);

/**
 * Same lazy shape as the email service, for the phone-verification OTP.
 *
 * There is deliberately no env-var check here: no paid SMS provider has been
 * chosen yet, so there is no key to look for. Inventing one now would mean a
 * deployed stage could "have" the variable set and still send nothing.
 *
 * Adding a provider is one file plus two lines: implement SmsServicePort as
 * e.g. TwilioSmsServiceAdapter, then return it here when its key is present —
 * exactly how resolveEmailService picks Resend above.
 */
function resolveSmsService(): SmsServicePort {
  const stage = infraStore.getEnv().STAGE ?? "local";

  if (stage !== "local") {
    throw new Error(
      `[bootstrap] No SMS provider is configured, so phone verification cannot ` +
        `work when STAGE="${stage}". Implement SmsServicePort for a provider and ` +
        "select it in resolveSmsService(), or leave phone verification unused.",
    );
  }

  console.info(
    "[bootstrap] Using the console SMS adapter. Verification codes will be " +
      "printed to this terminal.",
  );
  return new ConsoleSmsServiceAdapter();
}

class LazySmsServiceAdapter implements SmsServicePort {
  async sendSms(message: SmsMessage): Promise<void> {
    const service = resolveSmsService();
    await service.sendSms(message);
  }
}

const smsService = new LazySmsServiceAdapter();
registerSmsService(smsService);

export { emailService, smsService };
