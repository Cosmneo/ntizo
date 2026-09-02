import { useTranslation } from "react-i18next";
import { Check, Star } from "lucide-react";
import { SiteHeader } from "@/shared/components/site-header";
import { ServiceSearch } from "@/shared/components/service-search";
import { SurfaceArt } from "@/features/landing/ui/surface-art";
import { ACCENT, PAGE_BOTTOM } from "@/features/landing/ui/palette";

/**
 * The hero, and the header that sits on top of it.
 *
 * The header is absolutely positioned over the artwork rather than above it,
 * so the image runs to the top of the window. That means its controls are on
 * a dark ground — hence `onDark`, which is the only thing the shared header
 * needs to know about this page.
 */
export function Hero() {
  const { t } = useTranslation("landing");

  return (
    <section className="relative isolate grid min-h-[560px] items-center">
      <SurfaceArt
        seed={3}
        hero
        className="absolute inset-0 -z-20 h-full w-full"
      />
      {/* A light hand: just enough at the top and bottom to keep the header
          controls and the promise line legible, and almost nothing across the
          middle. The previous values darkened the whole image to near-black,
          which is what made the section feel heavy rather than open. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(14,31,55,.34)_0%,rgba(14,31,55,.10)_45%,rgba(14,31,55,.30)_100%)]"
      />

      <SiteHeader overlay />

      {/* A "MAPUTO · MATOLA · BEIRA" eyebrow used to sit above the headline.
          It was three city names written into a translation file, and only one
          of them has a listed business — so the first thing the page said was
          a claim about coverage that the directory behind it contradicts. The
          headline leads instead. */}
      <div className="page-shell pb-24 pt-32 text-center text-white">
        <h1 className="font-rounded text-[clamp(2.9rem,6.6vw,5rem)] font-extrabold leading-[1.02] tracking-[-0.035em] [text-shadow:0_2px_30px_rgba(0,0,0,.35)]">
          {t("heroLine1")}{" "}
          <span style={{ color: ACCENT }}>{t("heroLine2")}</span>
          <br />
          {t("heroLine3")}
        </h1>

        <p className="mx-auto mt-6 max-w-[40ch] text-[17px] text-white/90">
          {t("heroSubtitle")}
        </p>

        <ServiceSearch className="mx-auto mt-9 max-w-[720px] !py-1.5 !pl-6" />

        <div className="mt-7 flex flex-wrap justify-center gap-6">
          <span className="flex items-center gap-1.5 text-sm text-white/90">
            <Star className="h-4 w-4 fill-[#f5a524] text-[#f5a524]" />
            {t("promiseRated")}
          </span>
          {/* This one used to promise "payment held until it's done". There
              is no on-platform payment to hold anything with — `/bookings` is
              still a placeholder page and the messaging feature's own contact
              block says as much in its copy. Messaging is the thing that does
              work, so that is what the middle promise now claims. */}
          <span className="flex items-center gap-1.5 text-sm text-white/90">
            <Check className="h-4 w-4 text-[#8ef0b0]" />
            {t("promiseMessage")}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-white/90">
            <Check className="h-4 w-4 text-[#8ef0b0]" />
            {t("promiseVerified")}
          </span>
        </div>
      </div>

      {/* The wave is filled with the page background, so it reads as the page
          rising over the image rather than as a shape drawn on top of it. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-px z-10 leading-[0]"
      >
        <svg
          viewBox="0 0 1440 90"
          preserveAspectRatio="none"
          className="block h-[90px] w-full"
          style={{ fill: PAGE_BOTTOM }}
        >
          <path d="M0 44c150 34 320 44 520 30s360-52 560-52c130 0 250 16 360 44v24H0z" />
        </svg>
      </div>
    </section>
  );
}
