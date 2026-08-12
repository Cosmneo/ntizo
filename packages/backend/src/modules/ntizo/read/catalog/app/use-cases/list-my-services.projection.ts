import type { ServiceOwnerDTO } from "@ntizo/shared/read-models";
import { localeSchema } from "@ntizo/shared";
import { mediaUrl } from "../../../../shared/infrastructure/media/media-url";
import type { ServiceReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/service-read.repository.port";

export interface ListMyServicesInput {
  providerId: string;
  status?: string | undefined;
}

/**
 * Every service a provider owns, with every option and every translation.
 *
 * Translations are deliberately unresolved, for the same reason the category
 * administration read leaves them unresolved: the provider's job on this
 * screen is to see which languages are filled in and which are not, and a
 * resolved name would hide exactly that — a service with no English would
 * show its Portuguese and look finished.
 */
export class ListMyServicesProjection {
  constructor(private readonly repo: ServiceReadRepositoryPort) {}

  async execute(input: ListMyServicesInput): Promise<ServiceOwnerDTO[]> {
    const rows = await this.repo.listForProvider(input.providerId, input.status);
    return rows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      categoryId: r.categoryId,
      categoryCode: r.categoryCode,
      sourceLocale: r.sourceLocale as ServiceOwnerDTO["sourceLocale"],
      locationType: r.locationType,
      bookingMode: r.bookingMode,
      status: r.status,
      // Filtered after mapping, not before: `mediaUrl` returns null where
      // nothing serves the bucket, and a key with no URL is an image this
      // screen cannot show rather than an image that is not there.
      imageUrls: (r.imageKeys ?? [])
        .map((k) => mediaUrl(k))
        .filter((u): u is string => u !== null),
      sortOrder: r.sortOrder,
      bufferMinutes: r.bufferMinutes,
      slotIntervalMinutes: r.slotIntervalMinutes,
      memberIds: r.memberIds,
      options: r.options.map((o) => ({
        id: o.id,
        pricingMode: o.pricingMode,
        amountMinor: o.amountMinor,
        currency: o.currency,
        durationMinutes: o.durationMinutes,
        minMinutes: o.minMinutes,
        stepMinutes: o.stepMinutes,
        isDefault: o.isDefault,
        sortOrder: o.sortOrder,
        isActive: o.isActive,
        translations: o.translations
          // A locale the product has since dropped is still in the table; it
          // is not something the form can edit, so it is not something to show.
          .filter((t) => localeSchema.safeParse(t.locale).success)
          .map((t) => ({
            locale: t.locale as ServiceOwnerDTO["translations"][number]["locale"],
            name: t.name,
          })),
      })),
      translations: r.translations
        .filter((t) => localeSchema.safeParse(t.locale).success)
        .map((t) => ({
          locale: t.locale as ServiceOwnerDTO["translations"][number]["locale"],
          name: t.name,
          description: t.description,
        })),
      quoteForm: r.quoteForm,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
