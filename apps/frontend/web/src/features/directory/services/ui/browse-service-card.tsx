import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ImageIcon } from "lucide-react";
import {
  serviceCardImage,
  servicePriceCell,
} from "@/features/directory/services/domain/service-card";
import { ServicePrice } from "@/features/directory/services/ui/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * One published service, as a customer browses the whole platform.
 *
 * A sibling of `ServiceCard` rather than a prop on it, because the two answer
 * different questions. That one lives on a provider's own page, where the
 * business is already known and the card's job is to open its times. This one
 * is met cold: it has to say *whose* service it is, and it leads straight to
 * that service's own page — `/services/$id` — rather than to the provider's.
 * A reader who clicked "Corte (A, com equipa)" wanted that service, not a
 * chance to hunt for it again among everything else the barbershop offers.
 *
 * A `Link`, not a button. This is navigation, and a browse grid full of
 * buttons cannot be opened in a new tab, middle-clicked or crawled.
 *
 * The image falls back to nothing rather than to the provider's logo: on a
 * provider's own page a logo is recognisable context, but in a mixed grid it
 * would put the same picture on four unrelated cards.
 */
export function BrowseServiceCard({
  service,
  locale,
}: {
  service: ServiceDTO;
  locale: string;
}) {
  const { t } = useTranslation("directory");
  const image = serviceCardImage(service, null);
  const cell = servicePriceCell(service);

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <Link
        to="/services/$id"
        params={{ id: service.id }}
        className="block transition-colors hover:bg-[var(--color-muted)]"
      >
        <div className="grid aspect-[4/3] w-full place-items-center overflow-hidden bg-[var(--color-muted)]">
          {image ? (
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageIcon
              className="h-8 w-8 text-[var(--color-muted-foreground)]"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="grid gap-1 p-4">
          <span className="type-caption tracking-[0.08em] text-[var(--color-muted-foreground)] uppercase">
            {service.providerName}
          </span>
          <h3 className="type-body-medium font-semibold break-words">{service.name}</h3>
          <p className="type-caption text-[var(--color-muted-foreground)]">
            <ServicePrice cell={cell} locale={locale} />
          </p>

          {/* What kind of work it is and where it happens — the two things a
              grid of cards could not say before, and the two a reader uses to
              skip a card without opening it. The category leads: "canalização"
              rules a card out faster than "em sua casa" does. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="type-caption rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[var(--color-muted-foreground)]">
              {service.categoryName}
            </span>
            <span className="type-caption text-[var(--color-muted-foreground)]">
              {t(`filterWhereOption.${service.locationType}`, {
                // A location type the client does not know is a value added to
                // the database after this build shipped. Showing the raw code
                // is worse than showing nothing at all on a public card.
                defaultValue: "",
              })}
            </span>
          </p>
        </div>
      </Link>
    </li>
  );
}
