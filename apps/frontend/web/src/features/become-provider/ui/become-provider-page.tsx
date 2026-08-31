import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check } from "lucide-react";
import { LANDING_VARS } from "@/features/landing/ui/sections";
import { ACCENT, CARD, NAVY, PAGE_TOP } from "@/features/landing/ui/palette";
import { SurfaceArt } from "@/features/landing/ui/surface-art";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { SiteHeader } from "@/shared/components/site-header";
import { Footer } from "@/features/landing/ui/footer";

/**
 * The public case for becoming a provider.
 *
 * Public on purpose. Until now the only way in was a row inside the account
 * menu, so the one person the funnel exists for — someone who has not signed up
 * — could never see it.
 *
 * Built as an editorial page, not a stack of centred cards. The first version
 * of this file was exactly that stack and read as a settings screen with a
 * headline: everything centred, every block the same weight, nothing to look at
 * between one paragraph and the next. What carries a page with no photography
 * is contrast — a dark hero against a light body, one oversized number per
 * card, headings that sit left where the eye already is.
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
    <main
      style={{ ...LANDING_VARS, background: PAGE_TOP }}
      className="text-[color:var(--l-navy)]"
    >
      <Hero cta={cta} t={t} />
      <Paths t={t} />
      <Pricing cta={cta} t={t} />
      <Steps t={t} />
      <Requirements t={t} />
      <Closing cta={cta} t={t} />
      <Footer />
    </main>
  );
}

type T = (key: string) => string;

/** The eyebrow, with the rule that keeps it from floating. */
function Eyebrow({
  children,
  onDark = false,
}: {
  children: string;
  onDark?: boolean;
}) {
  return (
    <span
      className={`font-rounded inline-flex items-center gap-3 text-[12px] font-bold tracking-[0.18em] uppercase ${
        onDark ? "text-white/65" : "text-[color:var(--l-muted)]"
      }`}
    >
      <span
        aria-hidden="true"
        className="h-px w-8"
        style={{ background: ACCENT }}
      />
      {children}
    </span>
  );
}

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

function PrimaryCta({ cta, label }: { cta: CtaTarget; label: string }) {
  return (
    <Link
      to={cta.to}
      {...(cta.search ? { search: cta.search } : {})}
      className="font-rounded inline-flex items-center gap-2.5 rounded-full px-8 py-4 font-extrabold text-white transition-transform duration-200 hover:-translate-y-0.5"
      style={{ background: ACCENT }}
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

/**
 * Full-bleed and dark, with the content sitting low and left.
 *
 * Centred hero text is what the landing page already does; repeating it here
 * would make the two pages read as one long scroll. Low-and-left also leaves
 * the right half to the artwork, which is the only image this product has.
 */
function Hero({ cta, t }: { cta: CtaTarget; t: T }) {
  return (
    <header
      className="relative isolate flex min-h-[660px] flex-col"
      style={{ background: NAVY }}
    >
      <SurfaceArt
        seed={17}
        hero
        className="absolute inset-0 -z-10 h-full w-full"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(19,23,27,.82) 0%, rgba(19,23,27,.35) 38%, rgba(19,23,27,.86) 100%)," +
            "linear-gradient(94deg, rgba(19,23,27,.9) 6%, rgba(19,23,27,.35) 58%, rgba(19,23,27,0) 88%)",
        }}
      />

      <SiteHeader overlay />

      <div className="page-shell flex flex-1 flex-col justify-end pt-24 pb-20 text-white">
        <Eyebrow onDark>{t("eyebrow")}</Eyebrow>

        <h1 className="font-rounded mt-6 max-w-[17ch] text-[clamp(2.6rem,6.2vw,5rem)] leading-[0.98] font-extrabold tracking-[-0.035em]">
          {t("title")} <span style={{ color: ACCENT }}>{t("titleAccent")}</span>
        </h1>

        <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-white/80">
          {t("subtitle")}
        </p>

        <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <PrimaryCta cta={cta} label={t("cta")} />
          <Link
            to="/providers"
            className="font-rounded inline-flex items-center justify-center rounded-full border border-white/30 bg-white/5 px-8 py-4 font-bold text-white backdrop-blur transition-colors hover:border-white/70 hover:bg-white/10"
          >
            {t("ctaSecondary")}
          </Link>
        </div>

        <ul className="mt-10 flex flex-col gap-2 border-t border-white/15 p-0 pt-6 text-sm text-white/75 sm:flex-row sm:gap-9">
          {["trustFree", "trustPaid", "trustLocal"].map((key) => (
            <li key={key} className="flex list-none items-center gap-2">
              <Check className="h-4 w-4" style={{ color: ACCENT }} />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
    </header>
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
 * Built to the reference's shape after two attempts that were not. The numeral
 * is two digits sitting on the seam rather than one floating in the middle of
 * the artwork — at the seam it belongs to both halves and joins them; in the
 * middle it belongs to neither. The corners are nearly square, because a pill
 * that size reads as a button. And there is no checklist: three ticks under
 * every card turned a choice into a specification, so the differentiator is one
 * sentence and one tag.
 */
function Paths({ t }: { t: T }) {
  const paths = ["individual", "organization"] as const;

  return (
    <section className="relative isolate py-24">
      <GridTexture />

      <div className="page-shell relative">
        <div className="max-w-[62ch]">
          <Eyebrow>{t("pathsEyebrow")}</Eyebrow>
          <h2 className="font-rounded mt-5 text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance">
            {t("pathsTitle")}
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-[color:var(--l-muted)]">
            {t("pathsBlurb")}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {paths.map((key, i) => (
            <article
              key={key}
              className="overflow-hidden rounded-[10px] border transition-transform duration-300 hover:-translate-y-1"
              style={{ borderColor: "var(--l-border)", background: CARD }}
            >
              <div className="relative h-52">
                <SurfaceArt seed={31 + i * 7} className="h-full w-full" />
                {/* Sits ON the seam, and two digits rather than one: at this
                    size a single glyph reads as a stray character, and floating
                    it mid-image made it belong to neither half. */}
                <span
                  aria-hidden="true"
                  className="font-rounded absolute bottom-0 left-7 translate-y-[0.14em] text-[5.5rem] leading-[0.78] font-extrabold text-white tabular-nums [text-shadow:0_2px_20px_rgba(19,23,27,.45)]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="px-8 pt-9 pb-8">
                <h3 className="font-rounded text-[clamp(1.35rem,2.2vw,1.7rem)] font-extrabold tracking-[-0.02em]">
                  {t(`path.${key}.title`)}
                </h3>
                <p className="mt-3 leading-relaxed text-[color:var(--l-muted)]">
                  {t(`path.${key}.body`)}
                </p>
                {/* One fact, not a list. It is the thing that actually differs
                    between the two, which is what the reader came for. */}
                <span
                  className="font-rounded mt-6 inline-flex items-center rounded-full border px-3.5 py-1.5 text-[11px] font-extrabold tracking-[0.12em] uppercase"
                  style={{
                    borderColor: `color-mix(in srgb, ${ACCENT} 35%, transparent)`,
                    color: ACCENT,
                  }}
                >
                  {t(`path.${key}.tag`)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * A faint square grid behind a section.
 *
 * The light ground reads as empty at this width — the reference carries a
 * texture for the same reason. Faint enough to be felt rather than seen, and
 * masked at the edges so it does not end in a hard line.
 */
function GridTexture() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55]"
      style={{
        backgroundImage:
          "linear-gradient(var(--l-border) 1px, transparent 1px)," +
          "linear-gradient(90deg, var(--l-border) 1px, transparent 1px)",
        backgroundSize: "88px 88px",
        maskImage:
          "radial-gradient(ellipse 90% 70% at 50% 45%, #000 40%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 90% 70% at 50% 45%, #000 40%, transparent 100%)",
      }}
    />
  );
}

/**
 * The fee, stated as the page's loudest thing.
 *
 * It is the first question anyone asks, so it earns a full-bleed dark band
 * rather than a card: the provider sets the price, the customer pays exactly
 * that, and the platform's share is deducted from what the provider is paid.
 *
 * Until 2026-08-31 this band led with a giant "0%" and called it
 * commission-free — the decision of 2026-08-30 made that false. No number
 * replaces it: the rate is per provider (`commission_bps`) and
 * administrator-set, not a platform-wide constant safe to print in JSX, so
 * the headline carries the band alone now instead of completing a numeral.
 */
function Pricing({ cta, t }: { cta: CtaTarget; t: T }) {
  return (
    <section
      className="relative isolate overflow-hidden py-24"
      style={{ background: NAVY }}
    >
      <span
        aria-hidden="true"
        className="absolute -top-24 -left-24 -z-10 h-[420px] w-[420px] rounded-full opacity-[0.14]"
        style={{ background: ACCENT }}
      />
      <span
        aria-hidden="true"
        className="absolute -right-32 -bottom-32 -z-10 h-[380px] w-[380px] rounded-full opacity-[0.14]"
        style={{ background: ACCENT }}
      />

      <div className="page-shell">
        <div className="max-w-[62ch] text-white">
          <Eyebrow onDark>{t("pricingEyebrow")}</Eyebrow>
          <h2 className="font-rounded mt-5 max-w-[20ch] text-[clamp(1.9rem,4vw,3rem)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance">
            {t("pricingTitle")}
          </h2>
          <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-white/75">
            {t("pricingBody")}
          </p>
          <div className="mt-8">
            <PrimaryCta cta={cta} label={t("cta")} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * What happens after signing up, as an alternating stair.
 *
 * It was a thin four-column rail of small numbered circles, which gave four
 * equal footnotes to the part of the page that explains the whole commitment.
 * Each step is a full row now: an oversized outlined numeral with the words on
 * one side, a panel on the other, and a hairline between rows so the sequence
 * reads as one staircase rather than four cards.
 *
 * Step two says the application is reviewed, and that is not decoration:
 * registering creates a pending provider customers cannot find until an
 * administrator approves it. Leaving it out would make the wait look like a
 * fault.
 */
function Steps({ t }: { t: T }) {
  const steps = ["apply", "review", "publish", "earn"] as const;

  return (
    <section className="py-24">
      <div className="page-shell">
        <div className="max-w-[62ch]">
          <Eyebrow>{t("stepsEyebrow")}</Eyebrow>
          <h2 className="font-rounded mt-5 text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance">
            {t("stepsTitle")}
          </h2>
        </div>

        <ol className="mt-16 grid gap-0 p-0">
          {steps.map((key, i) => {
            const artFirst = i % 2 === 1;
            return (
              <li
                key={key}
                className="grid list-none items-center gap-10 border-t py-14 first:border-t-0 first:pt-0 md:grid-cols-2 md:gap-16"
                style={{ borderColor: "var(--l-border)" }}
              >
                <div className={artFirst ? "md:order-2" : undefined}>
                  {/* Outlined, not filled: at this size a solid numeral would
                      outshout the sentence beside it, which is the part that
                      has something to say. */}
                  <span
                    aria-hidden="true"
                    className="font-rounded block text-[clamp(3.5rem,7vw,5.5rem)] leading-[0.8] font-extrabold tabular-nums"
                    style={{
                      color: "transparent",
                      WebkitTextStroke: `2px ${ACCENT}`,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-rounded mt-6 text-[clamp(1.5rem,2.6vw,2rem)] font-extrabold tracking-[-0.02em]">
                    {t(`step.${key}.title`)}
                  </h3>
                  <p className="mt-3 max-w-[46ch] text-[17px] leading-relaxed text-[color:var(--l-muted)]">
                    {t(`step.${key}.body`)}
                  </p>
                </div>

                <div
                  className={`relative h-56 overflow-hidden rounded-[24px] ${artFirst ? "md:order-1" : ""}`}
                >
                  <SurfaceArt seed={53 + i * 11} className="h-full w-full" />
                  <span
                    className="font-rounded absolute bottom-4 left-4 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold tracking-[0.1em] text-white uppercase"
                    style={{ background: NAVY }}
                  >
                    {t(`step.${key}.tag`)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/**
 * What you need before starting.
 *
 * A ruled grid rather than a card of paragraphs: these are conditions to check
 * against yourself one at a time, and a table is what people read a checklist
 * in. The hairlines belong to the cells, so the block reads as one object.
 */
function Requirements({ t }: { t: T }) {
  const items = ["identity", "payout", "terms"] as const;

  return (
    <section className="pb-24">
      <div className="page-shell">
        <div className="max-w-[62ch]">
          <Eyebrow>{t("requirementsEyebrow")}</Eyebrow>
          <h2 className="font-rounded mt-5 text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance">
            {t("requirementsTitle")}
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-[color:var(--l-muted)]">
            {t("requirementsBlurb")}
          </p>
        </div>

        <div
          className="mt-12 grid overflow-hidden rounded-[24px] border md:grid-cols-3"
          style={{ borderColor: "var(--l-border)", background: CARD }}
        >
          {items.map((key) => (
            <article
              key={key}
              className="border-t p-8 first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0"
              style={{ borderColor: "var(--l-border)" }}
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                }}
              >
                <Check className="h-4.5 w-4.5" style={{ color: ACCENT }} />
              </span>
              <h3 className="font-rounded mt-5 text-lg font-extrabold tracking-[-0.01em]">
                {t(`requirement.${key}.title`)}
              </h3>
              <p className="mt-2.5 leading-relaxed text-[color:var(--l-muted)]">
                {t(`requirement.${key}.body`)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The last ask, full-bleed and dark.
 *
 * Its own band rather than a button bolted to the requirements block, because
 * the page needs somewhere to end. It also carries the way out for someone not
 * ready to commit — a question answered by a person beats a form abandoned.
 */
function Closing({ cta, t }: { cta: CtaTarget; t: T }) {
  return (
    <section
      className="relative isolate overflow-hidden py-28 text-center"
      style={{ background: NAVY }}
    >
      <SurfaceArt
        seed={91}
        hero
        className="absolute inset-0 -z-10 h-full w-full"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(19,23,27,.9) 0%, rgba(19,23,27,.72) 50%, rgba(19,23,27,.94) 100%)",
        }}
      />

      <div className="page-shell text-white">
        <h2 className="font-rounded mx-auto max-w-[20ch] text-[clamp(2.2rem,5vw,4rem)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
          {t("closingTitle")}
        </h2>
        <p className="mx-auto mt-5 max-w-[46ch] text-[17px] leading-relaxed text-white/75">
          {t("closingBody")}
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCta cta={cta} label={t("cta")} />
          <a
            href="mailto:ola@ntizo.com"
            className="font-rounded inline-flex items-center justify-center rounded-full border border-white/25 bg-white/5 px-8 py-4 font-bold text-white backdrop-blur transition-colors hover:border-white/60 hover:bg-white/10"
          >
            {t("closingTalk")}
          </a>
        </div>
      </div>
    </section>
  );
}
