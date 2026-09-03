import { useMutation } from "@tanstack/react-query";
import { submitContactRequest, type SubmitContactRequestInput } from "../data/contact-request.repository";

/** Not retried: a retry after a rate-limit refusal is exactly what the limit refuses. */
export function useSubmitContactRequest() {
  return useMutation({
    mutationFn: (input: SubmitContactRequestInput) => submitContactRequest(input),
    retry: false,
  });
}
