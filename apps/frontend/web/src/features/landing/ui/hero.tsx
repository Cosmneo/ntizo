import { useTranslation } from "react-i18next";
import { Tag, ShieldCheck, Smartphone } from "lucide-react";
import { SiteHeader } from "@/shared/components/site-header";
import { HeroCollage } from "@/features/landing/ui/hero-collage";

/**
 * The offer and three photographs.
 *
 * White, not artwork. The header used to sit on a generated gradient with a
 * wave cut out of the bottom of it, which is why it needed `overlay`; the
 * page now begins where every other public page begins, so the header is the
 * ordinary solid one. `overlay` stays on the component — `become-provider`
 * and the company pages still pass it — and so does `SurfaceArt`, which
 * `become-provider-page.tsx` imports five times.
 *
 * The headline is the offer in a customer's words. "Encontre. Reserve.
 * Feito." was a slogan that said nothing about what is being sold, and is
 * gone rather than moved — the section it used to title, "Como funciona",
 * was removed from the page outright.
 *
 * The search is gone from here too, and for the same reason: it is in the
 * header on every page now, so a field under the subtitle would be the same
 * question asked twice in one screenful. The provider's door went with it —
 * `SiteHeader` no longer takes a `providerCta`, and the footer's Company
 * column has carried the link all along.
 */
export function Hero() {
  const { t } = useTranslation("landing"); // t:Hero

  return (
    <>
      <SiteHeader />
      <section className="page-shell grid items-center gap-10 pb-14 pt-12 lg:grid-cols-[minmax(0,1fr)_580px] lg:gap-[72px]">
        <div>
          <h1 className="font-display max-w-[13ch] text-[clamp(2.4rem,5.2vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-[var(--color-headline)]">
            {t("home.heroTitle")}
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-[var(--color-foreground)]">
            {t("home.heroSubtitle")}
          </p>
          {/* Three claims the read models can support today. The version this
              replaces promised "payment held until it's done", which nothing
              on the platform does. */}
          <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-2.5">
            {[
              { Icon: Tag, label: t("home.proofPrice") },
              { Icon: ShieldCheck, label: t("home.proofVerified") },
              { Icon: Smartphone, label: t("home.proofPayment") },
            ].map(({ Icon, label }) => (
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
        </div>
        <HeroCollage />
      </section>
    </>
  );
}
