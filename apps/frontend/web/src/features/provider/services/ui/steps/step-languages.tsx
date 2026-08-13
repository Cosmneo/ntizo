import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Badge, Button, Input } from "@ntizo/frontend-ui";
import type { Locale } from "@ntizo/shared";
import { useSetServiceTranslation } from "../../viewmodel/use-service-editor";
import {
  optionSourceName,
  orderedLocales,
  type ProviderService,
} from "../../domain/types";

/**
 * Translating a service, and each of its options, into every other language
 * the platform speaks.
 *
 * Behind its own button, never a field in the main form — the spec's rule
 * for this whole panel is that only the language the provider actually wrote
 * in is required; every other one is optional and carries no friction. There
 * is no count here, no red state, no banner saying a language is missing:
 * a provider who abandons publishing because the platform asked for eight
 * languages costs the marketplace more than one untranslated listing does.
 *
 * One save per box rather than one for the whole sheet, unlike the category
 * form: `service.translation.set` *sets* a language's row rather than
 * patching it, and requires a non-empty name to do it — a single "save
 * everything" button would fail the moment it reached the first still-blank
 * language. Each box's own error lands right there, under the box it belongs
 * to, rather than in one shared banner at the top of the sheet.
 */
export function StepLanguages({
  service,
  providerId,
}: {
  service: ProviderService;
  providerId: string;
}) {
  const { t } = useTranslation("provider");
  const locales = orderedLocales(service.sourceLocale);

  return (
    <div className="grid content-start gap-6">
          <p className="type-body text-[var(--color-muted-foreground)]">
            {t("translationsHint")}
          </p>

          <TranslationGroup title={t("translationsServiceSection")}>
            {locales.map((locale) => (
              <TranslationBox
                key={locale}
                providerId={providerId}
                serviceId={service.id}
                locale={locale}
                isSource={locale === service.sourceLocale}
                withDescription
                existingName={
                  service.translations.find((tr) => tr.locale === locale)
                    ?.name ?? ""
                }
                existingDescription={
                  service.translations.find((tr) => tr.locale === locale)
                    ?.description ?? ""
                }
              />
            ))}
          </TranslationGroup>

          {service.options.map((option) => (
            <TranslationGroup
              key={option.id}
              title={t("translationsOptionSection", {
                name: optionSourceName(option, service.sourceLocale),
              })}
            >
              {locales.map((locale) => (
                <TranslationBox
                  key={locale}
                  providerId={providerId}
                  serviceId={service.id}
                  optionId={option.id}
                  locale={locale}
                  isSource={locale === service.sourceLocale}
                  existingName={
                    option.translations.find((tr) => tr.locale === locale)
                      ?.name ?? ""
                  }
                />
              ))}
            </TranslationGroup>
          ))}
    </div>
  );
}

function TranslationGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {title}
      </span>
      <div className="grid gap-2.5">{children}</div>
    </div>
  );
}

/**
 * One language's box: the name (and, for the service itself, the
 * description), saved on its own the moment the provider is happy with it.
 *
 * Pre-filled from whatever `service.mine` already returned for this locale —
 * that read comes back unresolved on purpose, so a blank box here really
 * does mean "not written yet", not a name that resolved from somewhere else.
 * Seeded once via lazy `useState`, not kept in sync with the props on every
 * re-render: the same choice `OptionCard` makes, and for the same reason —
 * after a save this box's own state already matches what the server has, so
 * there is nothing later renders need to overwrite it with.
 */
function TranslationBox({
  providerId,
  serviceId,
  optionId,
  locale,
  isSource,
  withDescription,
  existingName,
  existingDescription,
}: {
  providerId: string;
  serviceId: string;
  optionId?: string;
  locale: Locale;
  isSource: boolean;
  withDescription?: boolean;
  existingName: string;
  existingDescription?: string;
}) {
  const { t } = useTranslation("provider");
  const setTranslation = useSetServiceTranslation(providerId);
  const [name, setName] = useState(existingName);
  const [description, setDescription] = useState(existingDescription ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await setTranslation.mutateAsync({
        serviceId,
        ...(optionId ? { optionId } : {}),
        locale,
        name: name.trim(),
        // Options carry no description at all — `null` either way is what
        // the mutation expects when this box isn't the service's own, and a
        // `.trim() || null` on an always-empty string would say the same
        // thing, just less directly.
        description: withDescription ? description.trim() || null : null,
      });
    } catch (e) {
      setError(serverErrorMessage(e, t));
    }
  }

  return (
    <div className="grid gap-2 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3.5">
      <div className="flex items-center gap-2">
        <span className="type-body-medium font-semibold">
          {t(`locales.${locale}`, { defaultValue: locale })}
        </span>
        {isSource && <Badge tone="info">{t("translationsSourceBadge")}</Badge>}
      </div>

      {error && (
        <p className="type-caption text-[var(--color-destructive)]">{error}</p>
      )}

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t("serviceName")}
      />

      {withDescription && (
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label={t("serviceDescription")}
          className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
        />
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={name.trim().length === 0 || setTranslation.isPending}
          onClick={() => void save()}
        >
          {setTranslation.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {t("optionSave")}
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
  return t(`serviceError.${code}`, {
    defaultValue: t("translationSaveFailed"),
  });
}
