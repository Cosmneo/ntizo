import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Button, Input, cn } from "@ntizo/frontend-ui";
import { Field } from "@/shared/components/wizard/wizard-chrome";
import type { Locale } from "@ntizo/shared";
import { useSetServiceTranslation } from "../../viewmodel/use-service-editor";
import { optionSourceName, orderedLocales, type ProviderService } from "../../domain/types";

/**
 * Translating a service, and each of its options, into the other languages
 * the platform speaks.
 *
 * **One language at a time**, which is the whole shape of this screen. The
 * version this replaces rendered a box per (thing × language): eight boxes
 * for the service plus eight more for every priced option, each with its own
 * fields and its own Save. A service with three options was thirty-two boxes
 * and thirty-two buttons — a wall to scroll rather than a task to do.
 *
 * Nobody translates that way. A person picks a language and works through
 * everything in it, with the original in front of them. So: a row of language
 * chips that says which are done, then the original beside the fields, then
 * one Save for the language.
 *
 * **The source language is not one of the chips.** It is the column on the
 * left — the thing being translated *from*. It was previously editable here
 * too, which meant the service's own name had two homes: this screen and the
 * first step of the wizard. A typo in the original is fixed where it was
 * written.
 *
 * No count, no red state, no banner saying a language is missing. Only the
 * language the provider actually wrote in is required; a provider who
 * abandons publishing because the platform asked for eight languages costs
 * the marketplace more than one untranslated listing does.
 */
export function StepLanguages({
  service,
  providerId,
}: {
  service: ProviderService;
  providerId: string;
}) {
  const { t } = useTranslation("provider");
  const setTranslation = useSetServiceTranslation(providerId);

  // Everything except the source: `orderedLocales` puts the source first, and
  // it is the reference column rather than a target.
  const targets = orderedLocales(service.sourceLocale).filter(
    (locale) => locale !== service.sourceLocale,
  );

  const [target, setTarget] = useState<Locale | null>(targets[0] ?? null);
  const [error, setError] = useState<string | null>(null);

  const source = service.translations.find((tr) => tr.locale === service.sourceLocale);
  const sourceName = source?.name ?? "";

  /** Whether a language has a name written for the service itself. */
  const isFilled = (locale: Locale) =>
    (service.translations.find((tr) => tr.locale === locale)?.name ?? "").trim().length > 0;

  if (sourceName.trim().length === 0) {
    return (
      <p className="type-body text-[var(--color-muted-foreground)]">
        {t("translationsNothingToTranslate")}
      </p>
    );
  }

  return (
    <div className="grid content-start gap-5">
      <p className="type-body text-[var(--color-muted-foreground)]">{t("translationsHint")}</p>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("servicesLanguages")}>
        {targets.map((locale) => {
          const selected = locale === target;
          const filled = isFilled(locale);
          return (
            <button
              key={locale}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setTarget(locale);
                setError(null);
              }}
              className={cn(
                "type-caption inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
                selected
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] font-semibold text-[var(--color-primary)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              {/* A dot that has been filled in, not a tick and a cross: the
                  empty ones are optional, and a cross would read as a fault. */}
              {filled ? (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full border border-[var(--color-muted-foreground)]"
                />
              )}
              {t(`locales.${locale}`, { defaultValue: locale })}
              <span className="sr-only">
                {filled ? t("translationsFilled") : t("translationsEmpty")}
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="type-caption text-[var(--color-destructive)]">{error}</p>}

      {/* Keyed on the language, so switching seeds the fields from that
          language's own saved values rather than carrying the previous one's
          text across. A `useEffect` re-seeding on a prop change is the same
          idea with an extra render that briefly shows the wrong language. */}
      {target && (
        <LanguageForm
          key={target}
          service={service}
          providerId={providerId}
          target={target}
          sourceName={sourceName}
          sourceDescription={source?.description ?? ""}
          busy={setTranslation.isPending}
          onError={setError}
        />
      )}
    </div>
  );
}

/**
 * One language's whole translation: the service, then every option, with the
 * original beside each field.
 *
 * Saved as one action from the provider's side and several from the server's
 * — `service.translation.set` addresses one row at a time, and the service
 * and its options are different rows. They go in sequence rather than in
 * parallel: a half-applied language is confusing enough without the order
 * being unknowable too.
 */
function LanguageForm({
  service,
  providerId,
  target,
  sourceName,
  sourceDescription,
  busy,
  onError,
}: {
  service: ProviderService;
  providerId: string;
  target: Locale;
  sourceName: string;
  sourceDescription: string;
  busy: boolean;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation("provider");
  const setTranslation = useSetServiceTranslation(providerId);

  const existing = service.translations.find((tr) => tr.locale === target);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [optionNames, setOptionNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      service.options.map((option) => [
        option.id,
        option.translations.find((tr) => tr.locale === target)?.name ?? "",
      ]),
    ),
  );

  const language = t(`locales.${target}`, { defaultValue: target });

  async function save() {
    onError(null);
    try {
      await setTranslation.mutateAsync({
        serviceId: service.id,
        locale: target,
        name: name.trim(),
        description: description.trim() || null,
      });
      for (const option of service.options) {
        const optionName = (optionNames[option.id] ?? "").trim();
        // An untouched option is left alone rather than written as an empty
        // string: the server requires a non-empty name, and "not translated
        // yet" is a real state this screen must be able to leave things in.
        if (optionName.length === 0) continue;
        await setTranslation.mutateAsync({
          serviceId: service.id,
          optionId: option.id,
          locale: target,
          name: optionName,
          description: null,
        });
      }
    } catch (e) {
      onError(serverErrorMessage(e, t));
    }
  }

  return (
    <div className="grid gap-5 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
      {/* One column, and the original as the field's own hint line — the same
          label-hint-input shape every other step in this wizard uses. An
          earlier version put the original in a second column, which needed a
          transparent copy of the label to line the two sides up and left the
          input looking unlabelled. */}
      <div className="grid gap-5">
        <Field label={t("serviceName")} hint={sourceName}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`${t("serviceName")} — ${language}`}
          />
        </Field>

        <Field
          label={t("serviceDescription")}
          {...(sourceDescription ? { hint: sourceDescription } : {})}
        >
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label={`${t("serviceDescription")} — ${language}`}
            className="type-body w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
          />
        </Field>
      </div>

      {service.options.length > 0 && (
        <div className="grid gap-5 border-t border-[var(--color-border)] pt-5">
          <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("serviceOptionsTitle")}
          </span>
          {service.options.map((option) => (
            // The option's own name in the source language *is* the label
            // here — there is nothing to add above it, so no hint line.
            <Field key={option.id} label={optionSourceName(option, service.sourceLocale)}>
              <Input
                value={optionNames[option.id] ?? ""}
                onChange={(e) =>
                  setOptionNames((current) => ({ ...current, [option.id]: e.target.value }))
                }
                aria-label={`${optionSourceName(option, service.sourceLocale)} — ${language}`}
              />
            </Field>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={name.trim().length === 0 || busy || setTranslation.isPending}
          onClick={() => void save()}
        >
          {setTranslation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("translationsSaveLanguage", { language })}
        </Button>
      </div>
    </div>
  );
}

/** The server's code, not its English sentence — the message belongs in the reader's language. */
function serverErrorMessage(
  e: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const code = (e as { code?: string }).code ?? (e as Error).message;
  return t(`serviceError.${code}`, { defaultValue: t("translationSaveFailed") });
}
