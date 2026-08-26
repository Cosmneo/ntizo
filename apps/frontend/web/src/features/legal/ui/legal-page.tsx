import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

/**
 * The shared shape of both legal documents.
 *
 * One component, two routes, because a privacy policy and terms of service
 * differ only in their words. Sections come from the translation file as an
 * array so a translator can add or drop one without anybody editing this file
 * — and so the eight languages can legitimately differ in length, which they
 * will the moment one of them has to say something local.
 */
export interface LegalSection {
  heading: string;
  /** Paragraphs. Rendered as separate <p> so long documents stay readable. */
  body: string[];
}

export function LegalPage({ docKey }: { docKey: "privacy" | "terms" }) {
  const { t } = useTranslation("legal");
  // `returnObjects` because the sections are an array in the JSON. Typed
  // loosely on purpose: i18next cannot know the shape, and asserting it here
  // is the honest place to do it rather than pretending upstream.
  const sections = t(`${docKey}.sections`, { returnObjects: true }) as
    | LegalSection[]
    | string;

  return (
    <main className="page-shell py-16 md:py-24">
      <div className="mx-auto max-w-[720px]">
        <Link
          to="/"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          {t("backHome")}
        </Link>

        <h1 className="mt-6 text-3xl font-semibold md:text-4xl">
          {t(`${docKey}.title`)}
        </h1>
        <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
          {t("lastUpdated", { date: t(`${docKey}.updated`) })}
        </p>
        <p className="mt-6 text-[15px] leading-relaxed">{t(`${docKey}.intro`)}</p>

        {Array.isArray(sections) &&
          sections.map((section, i) => (
            <section key={i} className="mt-10">
              <h2 className="text-xl font-semibold">{section.heading}</h2>
              {section.body.map((paragraph, j) => (
                <p key={j} className="mt-3 text-[15px] leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

        <p className="mt-12 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-muted-foreground)]">
          {t("contact")}
        </p>
      </div>
    </main>
  );
}
