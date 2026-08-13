import { Link } from "@tanstack/react-router";
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
 * is met cold: it has to say *whose* service it is, and it leads to the
 * provider's page rather than straight into a booking, because that page is
 * where the availability flow already lives.
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
  const image = serviceCardImage(service, null);
  const cell = servicePriceCell(service);

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <Link
        to="/providers/$slug"
        params={{ slug: service.providerSlug }}
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
        </div>
      </Link>
    </li>
  );
}
