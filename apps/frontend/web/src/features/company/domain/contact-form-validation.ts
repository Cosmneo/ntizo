export interface ContactFormValues {
  name: string;
  email: string;
  message: string;
}

export interface ContactFormErrors {
  name?: "required";
  email?: "required" | "invalid";
  message?: "tooShort";
}

/** The same bounds the aggregate enforces, checked before the round trip so the refusal lands beside the field. */
export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactForm(
  values: ContactFormValues,
  options: { emailRequired: boolean },
): ContactFormErrors {
  const errors: ContactFormErrors = {};
  if (values.name.trim().length < NAME_MIN) errors.name = "required";
  const email = values.email.trim();
  if (email === "") {
    if (options.emailRequired) errors.email = "required";
  } else if (!EMAIL_SHAPE.test(email)) {
    errors.email = "invalid";
  }
  if (values.message.trim().length < MESSAGE_MIN) errors.message = "tooShort";
  return errors;
}
