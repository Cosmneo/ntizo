import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Smartphone, Tag } from "lucide-react";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { SiteHeader } from "@/shared/components/site-header";
import { Footer } from "@/features/landing/ui/footer";
import { SectionHead } from "@/features/landing/ui/section-head";
import { CONTACT } from "@/shared/lib/contact";

/**
 * The public case for becoming a provider.
 *
 * Public on purpose. Until now the only way in was a row inside the account
 * menu, so the one person the funnel exists for — someone who has not signed up
 * — could never see it.
 *
 * **It is drawn on the home page's rules, and that is the whole of this
 * file's styling.** It used to have a system of its own — a dark hero under a
 * generated gradient, a `#f2f8fe` ground, cards with artwork behind an
 * oversized `01`, a faint square grid, tracked-out uppercase eyebrows, and two
 * dark bands. The home shed all of that on 2026-09-07 and this page did not,
 * so the two read as two products. What replaced it is what the home already
 * does: white ground, `--color-headline` navy, one dark band at the end, and
 * no blue of its own — the page's only `--color-primary` is the search button
 * the header brings with it.
 *
 * **The repeated groups are cards, on the home page's own shape.** The first
 * pass drew them as items on a hairline, which is what the home page looked
 * like at the time. The home has since become bordered cards end to end —
 * services, businesses, and now the reviews — so a hairline pitch made the
 * reader cross from a page of cards into what looked like a different
 * product. `Paths`, `Steps` and `Requirements` all take the card
 * `CustomerReviews` draws, down to the token, and the wide column gaps that
 * separated bare columns come down to the `gap-6` a row of cards uses.
 * `Pricing` keeps its hairline-free paragraph: it is one sentence, and a card
 * around one sentence is a box.
 *
 * Nothing here paints with inline styles any more, which is what
 * `LANDING_VARS` and `PAGE_TOP` existed to supply — every colour is a token,
 * so this page follows dark mode like the rest of the site rather than staying
 * light on a dark screen.
 */
export function BecomeProviderPage() {
  const { t } = useTranslation("becomeProvider");
  const { data: user } = useCurrentUser();

  // Both ends of this land in the wizard. Signed in, straight there; signed
  // out, through registration carrying the intent — which is what stops the
  // chain breaking at "registered, now on the customer home, and the thing
  // they came for is nowhere".
  const cta: CtaTarget = user
    ? { to: "/onboarding" }
    : { to: "/sign-up", search: { next: "/onboarding" } };

  return (
    <main>
      <Hero cta={cta} t={t} />
      <Paths t={t} />
      <Pricing t={t} />
      <Steps t={t} />
      <Requirements t={t} />
      <ClosingBand cta={cta} t={t} />
      <Footer />
    </main>
  );
}

type T = (key: string) => string;

/**
 * Where the page's call to action goes.
 *
 * Signed in it is the wizard. Signed out it is registration carrying the
 * intent as a *search param* — a query string inside `to` would be read as
 * part of the path and never match a route. Carrying it is what stops the
 * chain breaking at "registered, landed on the customer home, and the thing
 * they came for was never offered again".
 */
type CtaTarget =
  | { to: "/onboarding"; search?: undefined }
  | { to: "/sign-up"; search: { next: string } };

/**
 * The page's primary action — navy, not blue.
 *
 * The site spends `--color-primary` on search and sign-in and nothing else,
 * and `SiteHeader` now draws the search bar on every public page. A blue
 * button here would be the page's *second* blue, sitting a few hundred pixels
 * under the first, which is exactly the rule the home keeps by having only
 * one. Navy is what every other affirmative control on the site already
 * wears: the filled filter pill, the current page number, the phone's
 * floating capsule.
 *
 * This page used to spend blue three times over — a button repeated in the
 * hero, the pricing band and the closing band — plus an accent on half the
 * headline, a tick beside every trust line and an outlined numeral on every
 * step.
 *
 * No arrow after the label: a "→" appended to a button is decoration the
 * listings dropped everywhere else.
 */
function PrimaryCta({ cta, label }: { cta: CtaTarget; label: string }) {
  return (
    <Link
      to={cta.to}
      {...(cta.search ? { search: cta.search } : {})}
      className="font-rounded inline-flex items-center rounded-full bg-[var(--color-navy-surface)] px-7 py-3.5 text-[15px] font-bold text-[var(--color-navy-on)]"
    >
      {label}
    </Link>
  );
}

/**
 * The claim, on white, with the header solid above it.
 *
 * `SiteHeader` without `overlay`: the overlay variant exists to sit on
 * artwork, and there is no artwork now. The headline is one navy sentence
 * rather than half a sentence in blue — colouring a phrase inside a heading is
 * the tell the listings and the home both removed.
 *
 * The three trust lines are the home hero's own shape: a stroked icon at 20px
 * in headline navy and a short line, not a blue tick.
 */
function Hero({ cta, t }: { cta: CtaTarget; t: T }) {
  const proofs = [
    { Icon: Tag, label: t("trustFree") },
    { Icon: ShieldCheck, label: t("trustPaid") },
    { Icon: Smartphone, label: t("trustLocal") },
  ];

  return (
    <>
      <SiteHeader />
      <section className="page-shell pt-12 pb-14">
        <h1 className="font-display max-w-[16ch] text-[clamp(2.4rem,5.2vw,3.6rem)] leading-[1.02] font-extrabold tracking-[-0.035em] text-[var(--color-headline)]">
          {t("title")} {t("titleAccent")}
        </h1>
        <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-[var(--color-foreground)]">
          {t("subtitle")}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-6">
          <PrimaryCta cta={cta} label={t("cta")} />
          {/* Bare text, like every destination in the header: the page's
              second action is somewhere to go, not a second button competing
              with the first. */}
          <Link
            to="/providers"
            className="text-[15px] font-semibold text-[var(--color-headline)] underline decoration-[var(--color-border-strong)] underline-offset-4"
          >
            {t("ctaSecondary")}
          </Link>
        </div>

        <ul className="mt-9 flex list-none flex-wrap gap-x-7 gap-y-2.5 p-0">
          {proofs.map(({ Icon, label }) => (
            <li key={label} className="flex items-center gap-2.5 text-sm font-medium">
              <Icon
                className="h-5 w-5 text-[var(--color-headline)]"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              {label}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/**
 * The two kinds of provider.
 *
 * Ntizo's own distinction and the first real decision a visitor makes: a person
 * offering their own labour and an establishment with staff need different
 * calendars and different teams, and someone reading this is working out which
 * one they are.
 *
 * **No numerals.** They used to carry `01` and `02` over generated artwork,
 * and a number promises an order the reader has to follow. This is a choice
 * between two things, not a first and a second — so the hairline that opens
 * each column is the whole of the structure, and the differentiator stays one
 * sentence and one tag.
 */
function Paths({ t }: { t: T }) {
  const paths = ["individual", "organization"] as const;

  return (
    <section className="page-shell pt-4 pb-16">
      <SectionHead title={t("pathsTitle")} blurb={t("pathsBlurb")} />
      <div className="grid gap-6 md:grid-cols-2">
        {paths.map((key) => (
          <article
            key={key}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-[var(--color-card-foreground)]"
          >
            <h3 className="font-display text-[20px] font-bold tracking-[-0.01em] text-[var(--color-headline)]">
              {t(`path.${key}.title`)}
            </h3>
            <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--color-foreground)]">
              {t(`path.${key}.body`)}
            </p>
            {/* One fact, not a list, and set as type rather than a tinted
                capsule — the thing that actually differs between the two. */}
            <span className="mt-4 block text-[13px] font-semibold text-[var(--color-muted-foreground)]">
              {t(`path.${key}.tag`)}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * The fee, stated in the reader's own column rather than shouted from a band.
 *
 * It is the first question anyone asks, so it gets a section of its own — but
 * on white, because the page now spends its one dark surface on the closing
 * ask. A second dark band was what made this page read as two pages stapled
 * together.
 *
 * No number, and that is deliberate: the rate is per provider
 * (`commission_bps`) and administrator-set, not a platform-wide constant safe
 * to print in JSX. Until 2026-08-31 this said "0%" and called itself
 * commission-free, which the decision of 2026-08-30 made false.
 */
function Pricing({ t }: { t: T }) {
  return (
    <section className="page-shell pb-16">
      <SectionHead title={t("pricingTitle")} />
      <p className="max-w-[62ch] text-[17px] leading-relaxed text-[var(--color-foreground)]">
        {t("pricingBody")}
      </p>
    </section>
  );
}

/**
 * What happens after signing up.
 *
 * **This one keeps its numbers**, because this one is a sequence: you cannot
 * publish before you are verified, and the reader needs the order. They are
 * small navy markers, the same shape the home's flow uses, rather than
 * outlined numerals the size of the headline they sit above.
 *
 * Step two says the application is reviewed, and that is not decoration:
 * registering creates a pending provider customers cannot find until an
 * administrator approves it. Leaving it out would make the wait look like a
 * fault.
 */
function Steps({ t }: { t: T }) {
  const steps = ["apply", "review", "publish", "earn"] as const;

  return (
    <section className="page-shell pb-16">
      {/* `stepsEyebrow` reads as a sentence, not a label — "From signing up to
          your first booking" — so it becomes the section's line now that the
          tracked-out uppercase eyebrows are gone. */}
      <SectionHead title={t("stepsTitle")} blurb={t("stepsEyebrow")} />
      <ol className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((key, i) => (
          <li
            key={key}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-[var(--color-card-foreground)]"
          >
            <span
              aria-hidden="true"
              className="mb-3.5 grid h-[26px] w-[26px] place-items-center rounded-full bg-[var(--color-navy-surface)] text-[12.5px] font-bold text-[var(--color-navy-on)] tabular-nums"
            >
              {i + 1}
            </span>
            <h3 className="font-display text-[16.5px] font-bold text-[var(--color-headline)]">
              {t(`step.${key}.title`)}
            </h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--color-foreground)]">
              {t(`step.${key}.body`)}
            </p>
            <span className="mt-3 block text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
              {t(`step.${key}.tag`)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * What you need before starting.
 *
 * Three conditions to check against yourself, so three cards — and still no
 * tinted disc with a tick in it beside each one. A tick says "done"; these
 * are things the reader has yet to bring.
 */
function Requirements({ t }: { t: T }) {
  const items = ["identity", "payout", "terms"] as const;

  return (
    <section className="page-shell pb-16">
      <SectionHead title={t("requirementsTitle")} blurb={t("requirementsBlurb")} />
      <div className="grid gap-6 md:grid-cols-3">
        {items.map((key) => (
          <article
            key={key}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-[var(--color-card-foreground)]"
          >
            <h3 className="font-display text-[16.5px] font-bold text-[var(--color-headline)]">
              {t(`requirement.${key}.title`)}
            </h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--color-foreground)]">
              {t(`requirement.${key}.body`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * The last ask, and the page's only dark surface.
 *
 * Drawn exactly as `ProviderBand` draws the home's: full width, plain navy,
 * no ornament — the navy ground is the whole of it. The tokens matter as much
 * as the colour. `--color-navy-on`/`--color-navy-surface` are the dark-aware
 * pair for putting a light control on this ground; a literal white button with
 * `--color-headline` text goes near-white on near-white in dark mode, which is
 * a bug this page's predecessor shipped once already.
 *
 * It carries the way out for someone not ready to commit — a question answered
 * by a person beats a form abandoned.
 */
function ClosingBand({ cta, t }: { cta: CtaTarget; t: T }) {
  return (
    <section className="relative mt-4 overflow-hidden bg-[var(--color-navy-surface)] text-[var(--color-navy-on)]">
      <div className="page-shell py-16">
        <h2 className="font-display max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.25rem)] leading-[1.08] font-extrabold tracking-[-0.03em]">
          {t("closingTitle")}
        </h2>
        <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-[var(--color-navy-on)]/75">
          {t("closingBody")}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-6">
          <Link
            to={cta.to}
            {...(cta.search ? { search: cta.search } : {})}
            className="font-rounded rounded-full bg-[var(--color-navy-on)] px-6 py-3.5 text-[15px] font-bold text-[var(--color-navy-surface)]"
          >
            {t("cta")}
          </Link>
          {/* No colour class of its own: it inherits `--color-navy-on` from
              the section, which is already the dark-aware light text this band
              needs. */}
          <a
            href={`mailto:${CONTACT.general}`}
            className="text-[14.5px] font-semibold underline decoration-[var(--color-navy-on)]/40 underline-offset-4"
          >
            {t("closingTalk")}
          </a>
        </div>
      </div>
    </section>
  );
}
