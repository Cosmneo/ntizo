import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import {
  MOCK_PROVIDERS,
  MOCK_STORIES,
  initialsOf,
} from "@/features/landing/domain/mock-content";
import { ScrollRail } from "./scroll-rail";
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { SurfaceArt } from "@/features/landing/ui/surface-art";
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
    <section id="categorias" className="py-20">
      <div className="page-shell">
        <Head
          title={t("categoriesTitle")}
          blurb={t("categoriesBlurb")}
          more={{ label: t("seeAll"), to: "/categories" }}
        />
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
                  // Plain, until the directory can filter by category. A link
                  // carrying a parameter the page ignores is a control that
                  // lies about being one.
                  to="/providers"
                  className="group"
                >
                  {cat.imageUrl ? (
                    <img
                      src={cat.imageUrl}
                      alt=""
                      className="aspect-[16/11] w-full rounded-2xl object-cover outline-offset-2 group-hover:outline-2 group-hover:outline-[color:var(--l-accent)]"
                    />
                  ) : (
                    // The generated art stays as the stand-in for a category
                    // with no photograph yet — seeded by position, so the same
                    // tile keeps the same pattern between visits.
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

export function PopularProviders() {
  const { t, i18n } = useTranslation("landing");
  // Formatted with the active locale so 4,8 / 4.8 and the thousands separator
  // follow the language rather than the developer's keyboard.
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);
  const rf = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <section id="populares" className="bg-[color:var(--l-band)] py-20">
      <div className="page-shell">
        <Head
          title={t("popularTitle")}
          blurb={t("popularBlurb")}
          more={{ label: t("seeAll"), to: "/providers" }}
        />
        <ScrollRail columns={3}>
          {MOCK_PROVIDERS.map((p, i) => (
            <Link
              key={p.id}
              to="/providers"
              className="flex flex-col overflow-hidden rounded-2xl bg-[color:var(--l-card)] shadow-sm transition-shadow hover:shadow-lg"
            >
              <SurfaceArt seed={i + 20} className="aspect-[16/10] w-full" />
              <div className="grid gap-1 p-5">
                <div className="flex items-center justify-between gap-3">
                  <b className="font-rounded text-base font-bold">{p.name}</b>
                  {p.badgeKey ? (
                    <span
                      className={
                        p.badgeTone === "top"
                          ? "font-rounded text-xs font-bold text-[#b8791a] "
                          : "font-rounded text-xs font-bold text-[color:var(--l-accent)]"
                      }
                    >
                      {t(p.badgeKey)}
                    </span>
                  ) : null}
                </div>
                <span className="text-sm text-[color:var(--l-muted)]">
                  {t(p.roleKey)}
                </span>
                <span className="flex items-center gap-1.5 text-sm tabular-nums">
                  <Star className="h-3.5 w-3.5 fill-[#f5a524] text-[#f5a524]" />
                  {rf.format(p.rating)}
                  <span className="text-[color:var(--l-muted)]">
                    ({t("reviewCount", { count: p.reviews })})
                  </span>
                </span>
                <span className="text-sm text-[color:var(--l-muted)]">
                  {p.city}
                </span>
                <span className="mt-1 text-sm">
                  {t("fromPrice")}{" "}
                  <b className="font-rounded font-extrabold tabular-nums">
                    {nf.format(p.fromPrice)} MZN
                  </b>
                </span>
              </div>
            </Link>
          ))}
        </ScrollRail>
      </div>
    </section>
  );
}

export function Stories() {
  const { t } = useTranslation("landing");
  return (
    <section className="py-20">
      <div className="page-shell">
        <Head title={t("storiesTitle")} blurb={t("storiesBlurb")} />
        <ScrollRail columns={4} className="md:grid-cols-2 lg:grid-cols-4">
          {MOCK_STORIES.map((s, i) => (
            <article
              key={s.id}
              className="overflow-hidden rounded-2xl bg-[color:var(--l-card)] shadow-sm"
            >
              <div className="relative">
                <SurfaceArt seed={i + 40} className="aspect-[16/9] w-full" />
                <span className="font-rounded absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white text-[11px] font-bold text-[color:var(--l-accent)]">
                  {initialsOf(s.author)}
                </span>
                <span className="font-rounded absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3.5 py-2.5 text-sm font-bold text-white">
                  {t(s.titleKey)}
                </span>
              </div>
              <div className="grid gap-1.5 p-4">
                <span
                  aria-hidden="true"
                  className="tracking-[0.1em] text-[#f5a524]"
                >
                  ★★★★★
                </span>
                <p className="text-sm text-[color:var(--l-muted)]">
                  {t(s.quoteKey)}
                </p>
                <span className="font-rounded mt-1 text-sm font-bold">
                  {s.author}
                </span>
              </div>
            </article>
          ))}
        </ScrollRail>
      </div>
    </section>
  );
}

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
          <span className="font-rounded block text-6xl font-extrabold leading-none tracking-tighter text-[color:var(--l-accent)] tabular-nums sm:text-[6rem]">
            0%
          </span>
          <h2 className="font-rounded mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
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
