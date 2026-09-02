import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BrandImage } from "@/shared/components/brand-image";
import { buttonVariants } from "@ntizo/frontend-ui";
import {
  formatHeadlinePrice,
  optionDurationMinutes,
  serviceCardImage,
  servicePriceCell,
} from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * One published service, as a row on its provider's own page.
 *
 * `ServiceCard` was the four-across grid this replaced. It outlived its last
 * caller by a while — the platform-wide browse had already moved to
 * `ServiceListingCard`, and `ProviderServicesSection` moved to these rows —
 * and has now been deleted; only its price line survives, as
 * `service-price.tsx`. A provider's own
 * page is a different reading task: a customer here has usually already
 * decided on the provider and is weighing which of their services to book,
 * which is a comparison of prices down one column, not a gallery of
 * photographs. A row gives every price the same horizontal position to land
 * the eye on; a grid of cards scatters them across the page at whatever
 * height each photograph happens to end.
 *
 * The photograph shrinks to a fixed-width thumbnail rather than disappearing:
 * `serviceCardImage` still falls back to the provider's own picture, and
 * still returns null when neither exists, in which case this renders the
 * placeholder tile and no `<img>` at all — a listing with no photograph is
 * the common case on this platform, not a broken one.
 */
export function ServiceRow({
  service,
  providerImageUrl,
  locale,
}: {
  service: ServiceDTO;
  providerImageUrl: string | null;
  locale: string;
}) {
  const { t } = useTranslation("directory");
  const cell = servicePriceCell(service);
  const image = serviceCardImage(service, providerImageUrl);

  // The meta line's duration and pricing-mode words both read the *default*
  // option directly, rather than branching on `cell.kind` the way the price
  // column does. `servicePriceCell`'s "from" case deliberately withholds the
  // default option's own duration from the price it prints — showing "· 30
  // min" beside a cheapest-of-several amount would be two facts about two
  // different options read as one (see that function's doc comment) — but
  // the meta line is not the price column, and a service's own typical
  // length is still worth stating beside its location. A `quote` service,
  // and a `priced` one caught with its last option deactivated (see
  // `ServicePriceCell`'s doc comment on that reachable, non-theoretical
  // state), both carry no default option at all, so both segments fall away
  // here rather than read a field off `null`.
  const defaultOption = service.defaultOption;
  const durationMinutes = defaultOption ? optionDurationMinutes(defaultOption) : null;
  const isHourly = defaultOption?.pricingMode === "hourly";
  const durationLabel =
    durationMinutes === null
      ? null
      : t(isHourly ? "serviceMinimumMinutes" : "serviceDurationMinutes", {
          count: durationMinutes,
        });
  // A location type this build has never heard of resolves to an empty
  // string rather than a raw, untranslated code — falsy, so it drops out of
  // the joined line below instead of leaving a stray " · " beside nothing.
  const whereLabel = t(`filterWhereOption.${service.locationType}`, { defaultValue: "" }) || null;
  const pricingModeLabel = defaultOption
    ? t(isHourly ? "pricingModeHourly" : "pricingModeFixed")
    : null;

  const { price, cta } = servicePriceAndCta({ cell, locale, serviceId: service.id, t });

  return (
    // `first:border-t` closes the top of the list itself — every other row's
    // top edge is the row above's `border-b`, so only the first row needs
    // one of its own. The 72px/112px column narrows below `sm`, and the
    // price/CTA column drops its own explicit position at the same
    // breakpoint so it stacks under the body instead of squeezing the name
    // into whatever width is left.
    <li className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-5 border-b border-[var(--color-border)] py-6 first:border-t sm:grid-cols-[112px_minmax(0,1fr)_auto]">
      <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-card-sm)] bg-[var(--color-muted)]">
        {/* Decorative: the service's
            name is already adjacent link text, so a non-empty alt would
            have a screen reader announce it twice per row — once here,
            once for the link — and `ProviderServicesSection` stacks every
            one of a provider's services into a list, where that doubles up
            once per row. */}
        {image ? (
          <BrandImage src={image} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>

      <div className="min-w-0">
        <Link
          to="/services/$id"
          params={{ id: service.id }}
          className="font-display font-semibold text-[17px]"
        >
          {service.name}
        </Link>
        {service.description && (
          <p className="type-body-medium mt-1.5 line-clamp-2 max-w-[52ch] text-[var(--color-muted-foreground)]">
            {service.description}
          </p>
        )}
        <p className="type-caption mt-2 text-[var(--color-muted-foreground)]">
          {[durationLabel, whereLabel].filter(Boolean).join(" · ")}
          {pricingModeLabel && (
            <>
              {durationLabel || whereLabel ? " · " : ""}
              <span className="font-semibold text-[var(--color-success)]">{pricingModeLabel}</span>
            </>
          )}
        </p>
      </div>

      {/* Same column at `sm` and below: `col-start-3` puts it beside the
          thumbnail and body on a wide screen, `col-start-2` (the default,
          overridden at `sm`) drops it under the body on a narrow one, which
          is also why the text-alignment flips from left to right at the
          same breakpoint. */}
      <div className="col-start-2 mt-3 flex flex-col items-start gap-2 text-left sm:col-start-3 sm:mt-0 sm:items-end sm:text-right">
        {price}
        {cta}
      </div>
    </li>
  );
}

/**
 * The price column and its call to action, decided together because they
 * agree with each other on every branch: a `quote` service prints
 * `quotePrice` in place of an amount *and* offers `quoteAction`, never the
 * filled availability button — a quote has no fixed duration and no price,
 * so there is no slot to check, the same reasoning `ServiceQuoteNotice`
 * applies in place of the price rail on the service page itself.
 *
 * `unavailable` (a `priced` service whose last active option was
 * deactivated after publish — reachable, not theoretical; see
 * `ServicePriceCell`'s own doc comment) gets no action at all, matching
 * `ServicePackagesUnavailable`'s restraint: the price already exists, only
 * its packages are gone, so offering a quote button here would tell this
 * customer to go ask for a price that is not what is missing.
 */
function servicePriceAndCta({
  cell,
  locale,
  serviceId,
  t,
}: {
  cell: ReturnType<typeof servicePriceCell>;
  locale: string;
  serviceId: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): { price: ReactNode; cta: ReactNode } {
  if (cell.kind === "quote") {
    return {
      price: <p className="type-h3 text-[var(--color-muted-foreground)]">{t("quotePrice")}</p>,
      // The service's own page, not checkout: a quote service has no priced
      // option to book and `booking.create` takes one. That page is where
      // `ServiceQuoteNotice` explains why there is no price yet and offers
      // the message button that actually starts the conversation — which is
      // the same place this button reached before, since the sheet it used to
      // open only ever showed that one sentence for a quote service.
      cta: (
        <Link
          to="/services/$id"
          params={{ id: serviceId }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("quoteAction")}
        </Link>
      ),
    };
  }

  if (cell.kind === "unavailable") {
    return {
      price: <p className="type-h3 text-[var(--color-muted-foreground)]">{t("priceUnavailable")}</p>,
      cta: null,
    };
  }

  if (cell.kind === "from") {
    return {
      price: (
        <p className="type-h3">
          {t("priceFrom", { amount: formatHeadlinePrice(cell.amountMinor, cell.currency, locale) })}
        </p>
      ),
      cta: <CheckAvailabilityLink serviceId={serviceId} label={t("availabilityCheckAction")} />,
    };
  }

  // `cell.kind === "priced"`: the one option this service has, its amount
  // plus the hourly suffix when it charges by the hour — `formatHeadlinePrice`
  // does not append that suffix itself, since it is a translated string a
  // domain function must not hard-code in English for every locale calling
  // it (see that function's own doc comment).
  const amount = formatHeadlinePrice(cell.option.amountMinor, cell.option.currency, locale);
  const suffix = cell.option.pricingMode === "hourly" ? ` ${t("priceHourlySuffix")}` : "";
  return {
    price: (
      <p className="type-h3">
        {amount}
        {suffix}
      </p>
    ),
    cta: <CheckAvailabilityLink serviceId={serviceId} label={t("availabilityCheckAction")} />,
  };
}

/**
 * The row's call to action: step 1 of checkout, as a link.
 *
 * A link rather than a button, and a page rather than the dialog this used to
 * open. `AvailabilitySheet` carried no booking control at all — booking did
 * not exist when it was written, and its own doc comment said so — so "see
 * availability" ended at a calendar somebody could only look at. It now
 * starts a purchase, which is a destination: it deserves a URL somebody can
 * open in a new tab, share, and be returned to after signing in.
 */
function CheckAvailabilityLink({ serviceId, label }: { serviceId: string; label: string }) {
  return (
    <Link to="/book/$serviceId" params={{ serviceId }} className={buttonVariants({ size: "sm" })}>
      {label}
    </Link>
  );
}
