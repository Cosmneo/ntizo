import type { ContactRequestKind } from "@ntizo/shared";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const SUBMIT = `
  mutation ContactRequestSubmit($input: ContactRequestSubmitInput!) {
    contactRequestSubmit(input: $input) { requestId reference }
  }`;

export interface SubmitContactRequestInput {
  kind: ContactRequestKind;
  topic: string;
  name: string;
  email: string | null;
  message: string;
  locale: string;
  originPath: string | null;
  /** The honeypot. Always sent, always empty for a person. */
  website: string;
}

/**
 * Through the private endpoint, not `publicGraphql`: the public mount serves
 * queries only and builds an empty context, so it has neither the address
 * the rate limit counts on nor the session the prefill comes from. The
 * private mount accepts anonymous callers (`requesterUserId: null`) and this
 * is the first mutation that relies on it — see the spec.
 */
export async function submitContactRequest(
  input: SubmitContactRequestInput,
): Promise<{ requestId: string; reference: string }> {
  const d = await sessionGraphql<{ contactRequestSubmit: { requestId: string; reference: string } }>(SUBMIT, {
    input,
  });
  return d.contactRequestSubmit;
}
