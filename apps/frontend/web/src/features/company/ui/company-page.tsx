import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { LANDING_VARS } from "@/features/landing/ui/sections";
import { ACCENT, NAVY, PAGE_TOP } from "@/features/landing/ui/palette";
import { Footer } from "@/features/landing/ui/footer";
import { SiteHeader } from "@/shared/components/site-header";

export type CompanyPageId = "about" | "contact" | "feedback" | "careers" | "help";

/**
 * The strip's candidates, in priority order. A page shows the first three
 * that are not itself. `/help` joins this list ahead of `about` — the FAQ is
 * a more likely next stop from a company page than the about page is.
 */
const STRIP: ReadonlyArray<{ id: CompanyPageId; to: string }> = [
  { id: "contact", to: "/contact" },
  { id: "feedback", to: "/feedback" },
  { id: "help", to: "/help" },
  { id: "about", to: "/about" },
  { id: "careers", to: "/careers" },
];

/**
 * The frame every company page wears.
 *
 * A compact dark band with the site header over it and the title left, not
 * the provider pitch's 660px hero: four secondary pages in a row with that
 * hero would tire the reader and push the answer under the fold on a phone.
 * Decided in brainstorming, 2026-09-02, against a light top and against the
 * full hero.
 *
 * Below the page's own sections, the "see also" strip and the footer, the
 * same on all four — which is how a reader who landed on the wrong page
 * reaches the right one without scrolling for the footer.
 */
export function CompanyPage({
  page,
  eyebrow,
  title,
  lede,
  centred = false,
  children,
}: {
  page: CompanyPageId;
  eyebrow: string;
  title: ReactNode;
  lede: string;
  /** The form pages centre their band, because the form under it is centred. */
  centred?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation("company");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const strip = STRIP.filter((link) => link.id !== page).slice(0, 3);

  return (
    <main style={{ ...LANDING_VARS, background: PAGE_TOP }} className="text-[color:var(--l-navy)]">
      <header className="relative isolate overflow-hidden" style={{ background: NAVY }}>
        <span
          aria-hidden="true"
          className="absolute -top-40 -left-32 -z-10 h-[420px] w-[420px] rounded-full opacity-[0.14]"
          style={{ background: ACCENT }}
        />
        <span
          aria-hidden="true"
          className="absolute -right-24 -bottom-36 -z-10 h-[320px] w-[320px] rounded-full opacity-[0.14]"
          style={{ background: ACCENT }}
        />
        <SiteHeader overlay current="none" />
        <div className={`page-shell pt-28 pb-16 text-white md:pt-32 md:pb-20 ${centred ? "text-center" : ""}`}>
          <Eyebrow onDark>{eyebrow}</Eyebrow>
          <h1
            className={`font-rounded mt-5 max-w-[18ch] text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance ${
              centred ? "mx-auto" : ""
            }`}
          >
            {title}
          </h1>
          <p className={`mt-5 max-w-[54ch] text-[17px] leading-relaxed text-white/80 ${centred ? "mx-auto" : ""}`}>
            {lede}
          </p>
        </div>
      </header>

      {children}

      <section className="page-shell border-t py-14" style={{ borderColor: "var(--l-border)" }}>
        <h2 className="m-0">
          <Eyebrow>{t("shared.seeAlso")}</Eyebrow>
        </h2>
        <div
          className="mt-5 grid overflow-hidden rounded-[16px] border md:grid-cols-3"
          style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
        >
          {strip.map((link) => (
            <Link
              key={link.id}
              to={link.to}
              search={link.id === "feedback" ? { from: pathname } : undefined}
              className="group border-t p-6 no-underline first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0"
              style={{ borderColor: "var(--l-border)", color: "inherit" }}
            >
              <span className="font-rounded flex items-center gap-2 text-[15px] font-extrabold">
                {t(`shared.links.${link.id}.title`)}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  style={{ color: ACCENT }}
                  aria-hidden="true"
                />
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-[color:var(--l-muted)]">
                {t(`shared.links.${link.id}.body`)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}

/**
 * A small uppercase label above a heading. Letter-spacing and weight keep it
 * from floating; there is no rule beside it, by the owner's rule.
 */
export function Eyebrow({ children, onDark = false }: { children: string; onDark?: boolean }) {
  return (
    <span
      className={`font-rounded inline-flex items-center text-[12px] font-bold tracking-[0.18em] uppercase ${
        onDark ? "text-white/65" : "text-[color:var(--l-muted)]"
      }`}
    >
      {children}
    </span>
  );
}

/** A section's opening: eyebrow, heading, and an optional sentence. */
export function SectionHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb?: string }) {
  return (
    <div className="max-w-[62ch]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-rounded mt-4 text-[clamp(1.7rem,3.4vw,2.5rem)] leading-[1.08] font-extrabold tracking-[-0.025em] text-balance">
        {title}
      </h2>
      {blurb && <p className="mt-4 text-[17px] leading-relaxed text-[color:var(--l-muted)]">{blurb}</p>}
    </div>
  );
}
