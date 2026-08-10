import { infraStore } from "../stores/infra-store";
import { ConsoleEmailServiceAdapter } from "./console-email-service.adapter";
import type { EmailServicePort } from "./email-service.port";
import { ResendEmailServiceAdapter } from "./resend-email-service.adapter";

/**
 * Picks the mail adapter from the request-scoped env.
 *
 * One definition, called by everything that sends. The API bootstrap had this
 * logic and the provider BC's adapter did not — it constructed a Resend client
 * unconditionally, so on a local machine with no key every invitation blew up
 * where verification emails printed happily to the terminal.
 *
 * Must be called from inside a request: `infraStore.getEnv()` throws otherwise.
 */
export function resolveEmailService(): EmailServicePort {
  const env = infraStore.getEnv();
  const stage = env.STAGE ?? "local";

  if (env.RESEND_API_KEY) return new ResendEmailServiceAdapter();

  // Fail fast rather than silently dropping mail. Without this, a deployed
  // stage missing the key accepts signups and then strands every user
  // unverifiable, because better-auth swallows send failures into a log line.
  if (stage !== "local") {
    throw new Error(
      `[email] RESEND_API_KEY is required when STAGE="${stage}". ` +
        "Set it, or run with STAGE=local to print emails to the console.",
    );
  }

  return new ConsoleEmailServiceAdapter();
}

/**
 * Resolves on every send rather than once at construction, so the check runs
 * against the current request's env instead of a stale or absent one.
 */
export class LazyEmailServiceAdapter implements EmailServicePort {
  async sendEmail(message: Parameters<EmailServicePort["sendEmail"]>[0]): Promise<void> {
    await resolveEmailService().sendEmail(message);
  }
}
