import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import { resolveTranslation } from "../../../../bounded-contexts/catalog/domain/translations";
import { mediaUrl } from "../../../../shared/infrastructure/media/media-url";
import type { ServiceReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/service-read.repository.port";
import type { PerformerReadPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/performer-read.port";

export interface GetServiceInput {
  id: string;
  locale: string;
}

/**
 * One published service, in the reader's language.
 *
 * The same published-AND-active rule `ListServicesProjection` enforces, and
 * enforced in the same place for the same reason: a fake, a future repository
 * or a forgotten WHERE clause must not be able to leak a row past it.
 *
 * Every reason to refuse returns the same `null`. A missing id, a draft and a
 * suspended provider are one answer to an anonymous reader — three answers
 * would be a way to enumerate what providers have not published.
 */
export class GetServiceProjection {
  constructor(
    private readonly repo: ServiceReadRepositoryPort,
    private readonly performers: PerformerReadPort,
  ) {}

  async execute(input: GetServiceInput): Promise<ServiceDetailDTO | null> {
    const r = await this.repo.getPublishedById(input.id);
    if (!r) return null;
    if (r.status !== "published" || r.providerStatus !== "active") return null;

    const t = resolveTranslation(r.translations, input.locale, r.sourceLocale);
    if (!t) return null;

    // Two arguments for the category, three for the service and its options:
    // a category is platform data with no author and falls back to the
    // platform's language; a service and its packages are the provider's
    // writing and fall back to theirs.
    const c = resolveTranslation(r.categoryTranslations, input.locale);
    const performers = await this.performers.byMemberIds(r.memberIds);

    return {
      id: r.id,
      providerId: r.providerId,
      providerName: r.providerName,
      providerSlug: r.providerSlug,
      providerType: r.providerType as ServiceDetailDTO["providerType"],
      providerLogoUrl: mediaUrl(r.providerLogoKey),
      providerCity: r.providerCity,
      providerDistrict: r.providerDistrict,
      categoryCode: r.categoryCode,
      categoryName: c?.name ?? r.categoryCode,
      name: t.name,
      description: t.description,
      locationType: r.locationType,
      bookingMode: r.bookingMode,
      imageUrls: (r.imageKeys ?? [])
        .map((k) => mediaUrl(k))
        .filter((u): u is string => u !== null),
      options: r.options.map((o) => {
        const ot = resolveTranslation(
          o.translations.map((x) => ({ ...x, description: null })),
          input.locale,
          r.sourceLocale,
        );
        return {
          id: o.id,
          // An option with no name at all still has a price, and dropping it
          // would hide a package the provider is selling. The empty string is
          // the UI's problem to render, not this layer's to refuse.
          name: ot?.name ?? "",
          amountMinor: o.amountMinor,
          currency: o.currency,
          durationMinutes: o.durationMinutes,
          minMinutes: o.minMinutes,
          stepMinutes: o.stepMinutes,
          pricingMode: o.pricingMode,
          isDefault: o.isDefault,
        };
      }),
      performers: performers.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        avatarUrl: p.avatarUrl,
      })),
      isFallback: t.isFallback,
    };
  }
}
