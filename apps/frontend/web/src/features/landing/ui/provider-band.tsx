import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * The offer made to somebody thinking about listing their work.
 *
 * The page's only dark surface, and full width rather than a rounded box
 * floating in the page — a navy card with two blurred circles on it was the
 * last piece of the template. The brand's tie pattern is the only ornament.
 *
 * The copy is deliberately not a headline percentage: the commission is
 * per-provider, so a number printed here would be wrong for everybody not on
 * the default.
 */
export function ProviderBand() {
  const { t } = useTranslation("landing"); // t:ProviderBand
  const facts = [
    { title: t("home.factPriceTitle"), body: t("home.factPriceBody") },
    { title: t("home.factAgendaTitle"), body: t("home.factAgendaBody") },
    { title: t("home.factMoneyTitle"), body: t("home.factMoneyBody") },
  ];

  return (
    <section className="relative mt-16 overflow-hidden bg-[var(--color-navy-surface)] text-[var(--color-navy-on)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-[520px] w-[620px] -rotate-[8deg] bg-[url('/brand/tie-pattern.svg')] bg-[length:144px_244px] opacity-[0.14]"
      />
      <div className="page-shell relative z-[1] grid items-center gap-14 py-16 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h2 className="font-display max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.25rem)] font-extrabold leading-[1.08] tracking-[-0.03em]">
            {t("home.bandTitle")}
          </h2>
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-[var(--color-navy-on)]/75">
            {t("home.bandBody")}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-6">
            {/* White, not the brand blue: the page spends its one blue on the
                header's search button. */}
            <Link
              to="/become-provider"
              className="font-rounded rounded-full bg-white px-6 py-3.5 text-[15px] font-bold text-[var(--color-headline)]"
            >
              {t("home.bandCta")}
            </Link>
            <Link
              to="/become-provider"
              className="text-[14.5px] font-semibold underline decoration-[var(--color-navy-on)]/40 underline-offset-4"
            >
              {t("home.bandLink")}
            </Link>
          </div>
        </div>
        <ul className="grid gap-3.5 border-l border-[var(--color-navy-on)]/20 pl-7">
          {facts.map((f) => (
            <li key={f.title} className="text-[15px] leading-snug text-[var(--color-navy-on)]/90">
              <b className="block font-bold text-[var(--color-navy-on)]">{f.title}</b>
              {f.body}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
