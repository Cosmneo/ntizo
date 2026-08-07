// Bootstraps shared infrastructure adapters and registers them with modules
// that need them (e.g. better-auth's email hooks). Must be imported once,
// before the first auth request is handled.
//
// Runs at module scope, before configMiddleware populates the infraStore, so
// it reads process.env directly — same source configMiddleware reads from.

import {
  ConsoleEmailServiceAdapter,
  ResendEmailServiceAdapter,
  type EmailServicePort,
} from "@ntizo/backend/shared/infra/email";
import { registerEmailService } from "@ntizo/backend/modules/better-auth";

function resolveEmailService(): EmailServicePort {
  const stage = process.env.STAGE ?? "local";
  const hasResendKey = Boolean(process.env.RESEND_API_KEY);

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

const emailService = resolveEmailService();
registerEmailService(emailService);

export { emailService };
