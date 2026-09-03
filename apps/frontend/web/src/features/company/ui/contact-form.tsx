import { useEffect, useState, type FormEvent } from "react";
import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check } from "lucide-react";
import { CONTACT_TOPICS, contactEmailRequired, type ContactRequestKind } from "@ntizo/shared";
import { Input, Label, Select } from "@ntizo/frontend-ui";
import { ACCENT } from "@/features/landing/ui/palette";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { CONTACT } from "@/shared/lib/contact";
import { isSafeInternalPath } from "@/shared/lib/zones";
import { MESSAGE_MAX, NAME_MAX, validateContactForm, type ContactFormErrors } from "../domain/contact-form-validation";
import { useSubmitContactRequest } from "../viewmodel/use-submit-contact-request";

type ContactField = "name" | "email" | "message";

/**
 * One form, two kinds.
 *
 * What differs by kind is the topic list, whether an email is required, and
 * whether the page it came from is sent (feedback only — "I was on the
 * services page" is the whole context of half of it). Everything else —
 * prefill, the trap, the success state, the errors — is the same and lives
 * here once.
 *
 * **Prefill is a suggestion, not a lock.** The fields fill from the session
 * once and stay editable: somebody writing on a colleague's behalf, or from a
 * shared account, should be able to say so.
 *
 * **The trap** is `website`: visually hidden, out of the tab order, hidden
 * from screen readers. A script that fills every field fills it; the server
 * answers with a success it never wrote.
 */
export function ContactForm({ kind, messagePlaceholder }: { kind: ContactRequestKind; messagePlaceholder: string }) {
  const { t, i18n } = useTranslation("company");
  const { data: user } = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The page a feedback came from travels as `?from=`, carried by the links
  // that lead to `/feedback`, and is kept only when it is an internal path.
  const { from } = useSearch({ strict: false }) as { from?: string };
  const originPath = kind === "feedback" && isSafeInternalPath(from ?? null) ? from! : null;
  const topics = CONTACT_TOPICS[kind];
  const emailRequired = contactEmailRequired(kind);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>(topics[0]);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<ContactField>>(new Set());
  const [prefilled, setPrefilled] = useState(false);

  /** A field's refusal shows once it has been left, not only once the whole form has been tried. */
  function markTouched(field: ContactField) {
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }

  useEffect(() => {
    if (!user || prefilled) return;
    setName((n) => n || user.name);
    setEmail((e) => e || user.email);
    setPrefilled(true);
  }, [user, prefilled]);

  const submit = useSubmitContactRequest();
  const allErrors = validateContactForm({ name, email, message }, { emailRequired });
  const shown = (field: ContactField) => attempted || touched.has(field);
  const errors: ContactFormErrors = {
    name: shown("name") ? allErrors.name : undefined,
    email: shown("email") ? allErrors.email : undefined,
    message: shown("message") ? allErrors.message : undefined,
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(validateContactForm({ name, email, message }, { emailRequired })).length > 0) return;
    submit.mutate({
      kind,
      topic,
      name: name.trim(),
      email: email.trim() === "" ? null : email.trim(),
      message: message.trim(),
      locale: i18n.resolvedLanguage ?? i18n.language,
      originPath,
      website,
    });
  }

  if (submit.data) {
    const replyEmail = email.trim();
    return (
      <div
        className="rounded-[20px] border p-8 text-center md:p-10"
        style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
      >
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT }}
        >
          <Check className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-rounded mt-4 text-[clamp(1.4rem,2.4vw,1.8rem)] font-extrabold tracking-[-0.02em]">
          {t("form.success.title")}
        </h2>
        <p className="mx-auto mt-2 max-w-[46ch] leading-relaxed text-[color:var(--l-muted)]">
          {replyEmail ? t("form.success.replyTo", { email: replyEmail }) : t("form.success.noEmail")}
        </p>
        <p className="mt-4 inline-block rounded-md px-3 py-1.5 font-mono text-sm" style={{ background: "var(--color-muted)" }}>
          {t("form.success.reference", { reference: submit.data.reference })}
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/" className="font-rounded rounded-full border px-6 py-3 text-[14px] font-bold no-underline" style={{ borderColor: "rgba(19,23,27,.25)", color: "inherit" }}>
            {t("form.success.home")}
          </Link>
        </div>
      </div>
    );
  }

  const serverError = submit.error
    ? submit.error instanceof GraphqlError && submit.error.code === "CONTACT_RATE_LIMITED"
      ? t("form.errors.rateLimited", { email: CONTACT.general })
      : t("form.errors.generic", { email: CONTACT.general })
    : null;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="relative rounded-[20px] border p-6 md:p-8"
      style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
    >
      {!user && (
        <p className="m-0 mb-5 text-sm text-[color:var(--l-muted)]">
          {t("form.signInHint")}{" "}
          <Link to="/sign-in" search={{ next: pathname }} className="font-semibold" style={{ color: ACCENT }}>
            {t("form.signInLink")}
          </Link>{" "}
          {t("form.signInHintRest")}
        </p>
      )}

      <div className="grid gap-5">
        <Field label={t("form.name")} htmlFor="contact-name" error={errors.name && t("form.errors.nameRequired")}>
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            maxLength={NAME_MAX}
            placeholder={t("form.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => markTouched("name")}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "contact-name-error" : undefined}
          />
        </Field>

        <Field
          label={t("form.email")}
          htmlFor="contact-email"
          hint={emailRequired ? undefined : t("form.emailOptional")}
          error={errors.email && t(errors.email === "required" ? "form.errors.emailRequired" : "form.errors.emailInvalid")}
        >
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t("form.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => markTouched("email")}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
          />
        </Field>

        <Field label={t("form.topic")} htmlFor="contact-topic">
          <Select
            id="contact-topic"
            name="topic"
            value={topic}
            onChange={setTopic}
            options={topics.map((value) => ({ value, label: t(`topics.${kind}.${value}`) }))}
          />
        </Field>

        <Field label={t("form.message")} htmlFor="contact-message" error={errors.message && t("form.errors.messageTooShort")}>
          <textarea
            id="contact-message"
            name="message"
            rows={6}
            maxLength={MESSAGE_MAX}
            placeholder={messagePlaceholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => markTouched("message")}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? "contact-message-error" : undefined}
            className="type-body w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
          />
        </Field>

        {/* The trap. Off-screen, out of the tab order, invisible to assistive
            tech; `autoComplete="off"` so a browser does not fill it for a
            person either. */}
        <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </div>

      {serverError && (
        <p role="alert" className="mt-5 text-sm text-[var(--color-destructive)]">
          {serverError}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 max-w-[48ch] text-xs leading-relaxed text-[color:var(--l-muted)]">
          {t("form.privacyNote")}{" "}
          <Link to="/privacy" className="underline" style={{ color: "inherit" }}>
            {t("form.privacyLink")}
          </Link>
        </p>
        <button
          type="submit"
          disabled={submit.isPending}
          className="font-rounded inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-extrabold text-white disabled:opacity-60"
          style={{ background: ACCENT }}
        >
          {submit.isPending ? t("form.sending") : t("form.submit")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

function Field({
  label, htmlFor, hint, error, children,
}: { label: string; htmlFor: string; hint?: string; error?: string | false; children: React.ReactNode }) {
  // Not injected onto `children` — there is no cloning here. Each field's own
  // input computes the same id and sets `aria-describedby` itself.
  const errorId = `${htmlFor}-error`;
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint && <p className="mt-1 mb-0 text-xs text-[color:var(--l-muted)]">{hint}</p>}
      <div className="mt-2">{children}</div>
      {error && <p id={errorId} className="mt-1.5 mb-0 text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}
