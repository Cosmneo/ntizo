import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Check, Star } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { initialsOf } from "@/features/landing/domain/initials";
import { ScrollRail } from "./scroll-rail";
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { usePopularProviders } from "@/features/landing/viewmodel/use-popular-providers";
import { useFeaturedReviews } from "@/features/landing/viewmodel/use-featured-reviews";
import { SurfaceArt } from "@/features/landing/ui/surface-art";
import { BrandImage } from "@/shared/components/brand-image";
import {
  ACCENT,
  BORDER,
  CARD,
  MUTED,
  NAVY,
  PAGE_TOP,
} from "@/features/landing/ui/palette";

/**
 * The landing palette, exposed to the sections below as local custom
 * properties. Declared once here rather than repeated as arbitrary hex values
 * in thirty class names — and scoped to this element, so nothing outside the
 * landing page picks them up.
 */
export const LANDING_VARS = {
  "--l-navy": NAVY,
  "--l-accent": ACCENT,
  "--l-card": CARD,
  "--l-muted": MUTED,
  "--l-border": BORDER,
  "--l-band": PAGE_TOP,
} as React.CSSProperties;

/** Shared section heading, so the three bands keep one rhythm. */
function Head({
  title,
  blurb,
  more,
}: {
  title: string;
  blurb: string;
  more?: { label: string; to: string };
}) {
  return (
    <div className="mb-7 sm:mb-9">
      {/* A notch smaller on a phone. At 30px these titles wrap to two lines
          and the heading eats the screen before the cards it introduces. */}
      <h2 className="font-rounded text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl">
        {title}
      </h2>
      {/* The link holds its place and the text wraps around it.
          
          Two earlier versions both moved it. `items-end` levelled it with the
          blurb's *last* line, so it sat lower in a section whose text ran to
          two lines. `flex-wrap` then let a long blurb push it onto a line of
          its own, left-aligned — which is worse, because now it is in a
          different place *and* on a different side.
          
          So: no wrapping, the blurb takes the space that is left
          (`min-w-0 flex-1`) and wraps inside its own column, and the link is
          `shrink-0` on the first baseline. It lands in the same spot in every
          section at every width, which is the whole point of a section
          heading being shared. */}
      <div className="mt-2 flex items-baseline justify-between gap-x-6 sm:gap-x-8">
        <p className="min-w-0 flex-1 max-w-[54ch] text-[color:var(--l-muted)]">
          {blurb}
        </p>
        {more ? (
          <Link
            to={more.to}
            className="font-rounded shrink-0 text-sm font-bold text-[color:var(--l-accent)] hover:underline"
          >
            {more.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The vertical rhythm between sections.
 *
 * Was a flat `py-20`, which is 160px of nothing between one section and the
 * next — a quarter of a section's own height, on a page whose sections are
 * 500-700px tall. The gap read as a mistake rather than as breathing room, and
 * on a phone it meant scrolling past a screenful of empty page between every
 * two things.
 *
 * Tighter on small screens on purpose: 160px is a third of a phone viewport
 * and the same 160px is a seventh of a laptop's.
 */
const SECTION_PAD = "py-10 md:py-14";

/** How many tiles the home page shows before "see all". */
const LANDING_CATEGORIES = 4;

export function Categories() {
  const { t } = useTranslation("landing");
  // Real categories now, in the reader's language: the server resolves the
  // name and falls back to the platform's own where a translation is missing,
  // so switching language changes these the way it changes everything else.
  // They used to be eight translation keys, which worked only for a list
  // developers shipped — the point of the admin form is the ninth.
  // Four, not all of them. The home page is an invitation to browse, and a
  // rail of everything is a directory rendered where nobody came looking for
  // one — "see all" is what leads to the full list.
  const { data, isLoading } = useCategoryPreview(LANDING_CATEGORIES);
  const rail = data?.items ?? [];
  return (
    <section id="categorias" className={SECTION_PAD}>
      <div className="page-shell">
        {/* No "see all": the page it led to is gone, and a link to a 404 is
            worse than no link. Each tile now carries its own category through
            to the services browse, so the rail is navigable without one. */}
        <Head title={t("categoriesTitle")} blurb={t("categoriesBlurb")} />
        <ScrollRail columns={4} cardWidth="44%">
          {isLoading
            ? // As many placeholders as tiles that land, so the rail does not
              // change height when they arrive.
              Array.from({ length: LANDING_CATEGORIES }, (_, i) => (
                <div key={i}>
                  <Skeleton className="aspect-[16/11] w-full rounded-2xl" />
                  <Skeleton className="mt-3 h-[17px] w-24" />
                </div>
              ))
            : rail.map((cat, i) => (
                <Link
                  key={cat.id}
                  // The category's own services, not an undifferentiated
                  // directory. This used to go to a bare `/providers` with a
                  // note explaining that no page could filter by category yet
                  // — `/services` has taken a `category` since the browse page
                  // shipped, so the tile now lands on the thing it names.
                  to="/services"
                  search={{ category: cat.code }}
                  className="group"
                >
                  {/* The last raw `<img>` on this page, and the last broken
                      one: a category whose stored image had been swept from
                      the bucket drew the browser's glyph here while every
                      other tile on the page had already been taught to fall
                      back. The generated art still stands in for a category
                      that never had a photograph — this rail is four tiles
                      wide, so the pattern reads as decoration rather than as
                      four identical marks. */}
                  {cat.imageUrl ? (
                    <BrandImage
                      src={cat.imageUrl}
                      alt=""
                      className="aspect-[16/11] w-full rounded-2xl object-cover outline-offset-2 group-hover:outline-2 group-hover:outline-[color:var(--l-accent)]"
                    />
                  ) : (
                    <SurfaceArt
                      seed={i + 1}
                      className="aspect-[16/11] w-full rounded-2xl outline-offset-2 group-hover:outline-2 group-hover:outline-[color:var(--l-accent)]"
                    />
                  )}
                  <b className="font-rounded mt-3 block text-sm font-bold">
                    {cat.name}
                  </b>
                </Link>
              ))}
        </ScrollRail>
      </div>
    </section>
  );
}

/** How many businesses the home page puts under "popular". */
const LANDING_PROVIDERS = 3;

/**
 * The businesses the home page recommends.
 *
 * Real rows now. It used to draw three invented people with invented scores —
 * "Flávio Magalhães · 4,3 · 130 avaliações" — which on a public page is a
 * claim about a named business that nobody made. The query behind it asks for
 * verified providers sorted by rating, so both halves of the word "popular"
 * are things the platform can point at: a score customers gave, and a document
 * an administrator checked.
 *
 * Everything the card draws is nullable on the way in, and each one is guarded
 * rather than defaulted. A business nobody has reviewed has no rating — not a
 * zero, which is a score a person could have given — and one that publishes
 * nothing priced has no "from" line.
 */
export function PopularProviders() {
  const { t, i18n } = useTranslation("landing");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // Formatted with the active locale so 4,8 / 4.8 and the thousands separator
  // follow the language rather than the developer's keyboard.
  const rf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const { data, isLoading } = usePopularProviders(LANDING_PROVIDERS);
  const providers = data?.items ?? [];

  // Nothing to recommend yet, so the section does not appear. An empty rail
  // under the word "popular" says the platform has nobody on it, which is a
  // worse thing for a home page to say than nothing at all. It comes back on
  // its own the day a first provider is verified.
  if (!isLoading && providers.length === 0) return null;

  return (
    <section id="populares" className={`bg-[color:var(--l-band)] ${SECTION_PAD}`}>
      <div className="page-shell">
        <Head
          title={t("popularTitle")}
          blurb={t("popularBlurb")}
          more={{ label: t("seeAll"), to: "/providers" }}
        />
        <ScrollRail columns={3}>
          {isLoading
            ? // As many placeholders as cards that land, so the rail does not
              // change height when they arrive.
              Array.from({ length: LANDING_PROVIDERS }, (_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl bg-[color:var(--l-card)] shadow-sm"
                >
                  <Skeleton className="aspect-[16/10] w-full rounded-none" />
                  <div className="grid gap-2 p-5">
                    <Skeleton className="h-[18px] w-2/3" />
                    <Skeleton className="h-[15px] w-1/2" />
                    <Skeleton className="h-[15px] w-1/3" />
                  </div>
                </div>
              ))
            : providers.map((p, i) => {
                const where = [p.district, p.city].filter(Boolean).join(", ");
                // Both halves checked: `Intl` cannot format an amount without
                // a currency, and the read model can only promise the two
                // arrive together.
                const priced = p.fromAmountMinor !== null && p.fromCurrency !== null;
                // Named rather than written inline as `a ?? b ? x : y`, which
                // parses correctly but reads as though it might not.
                const photo = p.photoUrls[0] ?? p.logoUrl;
                return (
                  <Link
                    key={p.id}
                    to="/providers/$slug"
                    params={{ slug: p.slug }}
                    className="flex flex-col overflow-hidden rounded-2xl bg-[color:var(--l-card)] shadow-sm transition-shadow hover:shadow-lg"
                  >
                    {/* The business's own photograph of its work, then its
                        logo, then the generated tile — the order the directory
                        card uses, and for the same reason: every card here is
                        one business, so its logo is exactly the right picture.
                        Most have neither, which is why the last fallback is
                        generated rather than grey. */}
                    {/* `BrandImage` rather than a bare `<img>`: a photograph
                        whose URL no longer resolves drew the browser's broken
                        glyph, which is how this section looked on dev the day
                        it shipped -- every seeded portfolio file is a dead URL.
                        With no photo at all the generated art still stands in,
                        because a rail of three is small enough for it to read
                        as decoration rather than as three identical marks. */}
                    {photo ? (
                      <BrandImage
                        src={photo}
                        alt=""
                        className="aspect-[16/10] w-full object-cover"
                      />
                    ) : (
                      <SurfaceArt seed={i + 20} className="aspect-[16/10] w-full" />
                    )}
                    <div className="grid gap-1 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <b className="font-rounded text-base font-bold">{p.name}</b>
                        {/* The one claim on the card the platform makes itself
                            rather than repeats. The badges here used to be
                            "Recommended" and "Top rated", which nobody awarded. */}
                        {p.verified ? (
                          <span className="font-rounded flex shrink-0 items-center gap-1 text-xs font-bold text-[color:var(--l-accent)]">
                            <Check className="h-3 w-3" aria-hidden="true" />
                            {t("badgeVerified")}
                          </span>
                        ) : null}
                      </div>
                      {/* The trades it actually publishes services in, from the
                          server in the reader's language. A business with no
                          published category yet simply has no line here. */}
                      {p.categories[0] ? (
                        <span className="text-sm text-[color:var(--l-muted)]">
                          {p.categories[0].name}
                        </span>
                      ) : null}
                      {/* Null, not zero. Rendering 0,0 for a business nobody
                          has reviewed tells every visitor it is the worst on
                          the platform. */}
                      {p.ratingAverage !== null ? (
                        <span className="flex items-center gap-1.5 text-sm tabular-nums">
                          <Star className="h-3.5 w-3.5 fill-[#f5a524] text-[#f5a524]" />
                          {rf.format(p.ratingAverage)}
                          <span className="text-[color:var(--l-muted)]">
                            ({t("reviewCount", { count: p.reviewCount })})
                          </span>
                        </span>
                      ) : (
                        <span className="text-sm text-[color:var(--l-muted)]">
                          {t("noReviewsYet")}
                        </span>
                      )}
                      {where ? (
                        <span className="text-sm text-[color:var(--l-muted)]">{where}</span>
                      ) : null}
                      {priced ? (
                        <span className="mt-1 text-sm">
                          {t("fromPrice")}{" "}
                          <b className="font-rounded font-extrabold tabular-nums">
                            {formatFrom(p.fromAmountMinor!, p.fromCurrency!, locale)}
                          </b>
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
        </ScrollRail>
      </div>
    </section>
  );
}

/**
 * Minor units as money, in the reader's language.
 *
 * Whole units only: this is a "from" price, and two decimals of precision on a
 * number that is already an approximation is noise. `Intl` knows every
 * currency's symbol and where it goes, so the old hardcoded " MZN" suffix does
 * not belong here — it was also wrong for any provider trading in anything
 * else, which the read model has always allowed.
 *
 * `useGrouping: "always"` because `pt-MZ` and `pt-PT` set
 * `minimumGroupingDigits: 2`, so their default leaves a four-digit price
 * ungrouped. Same reasoning, and the same call, as the directory card's own
 * `formatPrice`.
 */
function formatFrom(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(amountMinor / 100);
}

/** How many testimonials the rail draws. Mirrors `MAX_FEATURED` on the server. */
const LANDING_STORIES = 4;

/**
 * What customers said, in their own words.
 *
 * Real reviews now, chosen by an administrator on `/admin/reviews`. It used to
 * be four invented testimonials — "Ana R.", "Paulo M." and two more, each with
 * a hardcoded five-star row — written into `mock-content.ts`. On a page that
 * also names real businesses and real prices, an invented quotation is the
 * hardest thing on it to tell apart from the truth.
 *
 * Nothing here is translated, and the card carries no `t()` for the words: a
 * review is what one person wrote, in the language they wrote it. Rendering it
 * in the reader's language would make it no longer a quotation.
 */
export function Stories() {
  const { t } = useTranslation("landing");
  const { data, isLoading } = useFeaturedReviews(LANDING_STORIES);
  const stories = data ?? [];

  // Nothing featured, so the section does not appear — the same rule as the
  // popular rail above. A "customer stories" heading over an empty row is a
  // worse thing for the page to say than nothing at all, and until an
  // administrator picks a review there is genuinely nothing to say.
  if (!isLoading && stories.length === 0) return null;

  return (
    <section className={SECTION_PAD}>
      <div className="page-shell">
        <Head title={t("storiesTitle")} blurb={t("storiesBlurb")} />
        <ScrollRail columns={4} className="md:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: LANDING_STORIES }, (_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl bg-[color:var(--l-card)] shadow-sm"
                >
                  <Skeleton className="aspect-[16/9] w-full rounded-none" />
                  <div className="grid gap-2 p-4">
                    <Skeleton className="h-[15px] w-20" />
                    <Skeleton className="h-[15px] w-full" />
                    <Skeleton className="h-[15px] w-2/3" />
                  </div>
                </div>
              ))
            : stories.map((s, i) => (
                <article
                  key={s.id}
                  className="overflow-hidden rounded-2xl bg-[color:var(--l-card)] shadow-sm"
                >
                  <div className="relative">
                    <SurfaceArt seed={i + 40} className="aspect-[16/9] w-full" />
                    {/* The author's initials, or a dash where they set no
                        name. `initialsOf("")` would render an empty circle,
                        which reads as a failed image rather than as somebody
                        who chose not to be named. */}
                    <span className="font-rounded absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white text-[11px] font-bold text-[color:var(--l-accent)]">
                      {s.authorName ? initialsOf(s.authorName) : "—"}
                    </span>
                    {/* The business, which is also the link. The invented
                        version had an invented headline here; a real review
                        has no title, and what a reader actually wants to know
                        is who the review is about. */}
                    <Link
                      to="/providers/$slug"
                      params={{ slug: s.providerSlug }}
                      className="font-rounded absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/85 to-transparent px-3.5 py-2.5 text-sm font-bold text-white"
                    >
                      {s.providerName}
                    </Link>
                  </div>
                  <div className="grid gap-1.5 p-4">
                    {/* The score this person actually gave, not five stars on
                        every card. Filled to `rating`, hollow after it — and
                        an accessible label, because a row of glyphs says
                        nothing to somebody listening to the page. */}
                    <span
                      className="flex gap-0.5"
                      role="img"
                      aria-label={t("storyRating", { rating: s.rating })}
                    >
                      {Array.from({ length: 5 }, (_, star) => (
                        <Star
                          key={star}
                          aria-hidden="true"
                          className={
                            star < s.rating
                              ? "h-3.5 w-3.5 fill-[#f5a524] text-[#f5a524]"
                              : "h-3.5 w-3.5 text-[color:var(--l-border)]"
                          }
                        />
                      ))}
                    </span>
                    <p className="text-sm text-[color:var(--l-muted)]">{s.comment}</p>
                    <span className="font-rounded mt-1 text-sm font-bold">
                      {s.authorName ?? t("storyAnonymous")}
                    </span>
                  </div>
                </article>
              ))}
        </ScrollRail>
      </div>
    </section>
  );
}

/**
 * The offer made to somebody thinking about listing their work.
 *
 * The copy here is deliberately not a headline percentage. The commission is
 * per-provider — an administrator can move any single one — so a number
 * printed on a marketing page would be wrong for everybody not on the default,
 * and there is no public field that answers "what does Ntizo charge" without
 * publishing a settings table to every crawler. It says a stated percentage,
 * shown before you list, instead.
 */
export function ProviderCall() {
  const { t } = useTranslation("landing");
  return (
    <section className="pb-24 pt-4">
      <div className="page-shell">
        <div className="relative overflow-hidden rounded-[28px] bg-[color:var(--l-navy)] px-8 py-16 text-center text-white">
          <span
            aria-hidden="true"
            className="absolute -left-5 -top-8 h-32 w-32 rounded-full bg-[color:var(--l-accent)] opacity-[.16]"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-6 right-10 h-24 w-24 rounded-full bg-[color:var(--l-accent)] opacity-[.16]"
          />
          <h2 className="font-rounded text-3xl font-extrabold tracking-tight sm:text-5xl">
            {t("zeroFeeTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-white/75">
            {t("zeroFeeBody")}
          </p>
          {/* The page, not the sign-up form. This block makes an offer;
              sending someone straight to a password field answers a question
              they have not asked yet. */}
          <Link
            to="/become-provider"
            className="font-rounded mt-8 inline-block rounded-full bg-[color:var(--l-accent)] px-9 py-4 font-extrabold text-white"
          >
            {t("zeroFeeCta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
