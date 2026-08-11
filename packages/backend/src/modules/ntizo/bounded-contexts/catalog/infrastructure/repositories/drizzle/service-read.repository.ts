import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  category,
  service,
  serviceOption,
  serviceOptionTranslation,
  serviceQuoteForm,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type {
  ServiceOwnerRow,
  ServiceReadRepositoryPort,
} from "../../../app/ports/outbound/service-read.repository.port";

/**
 * A provider's own services, every option and every translation.
 *
 * Options, translations and option translations are fetched in three further
 * queries keyed by the ids already fetched, not joined: each is a one-to-many
 * relation to the service (or, for option translations, to the option), and
 * joining a one-to-many multiplies the service row — an eight-option service
 * would count as eight rows everywhere a count on this list matters. The
 * category is joined directly because it is the opposite shape, exactly one
 * per service, and cannot multiply anything.
 */
export class DrizzleServiceReadRepository implements ServiceReadRepositoryPort {
  async listForProvider(
    providerId: string,
    status: string | undefined,
  ): Promise<ServiceOwnerRow[]> {
    const db = getDb();
    const where = status
      ? and(eq(service.providerId, providerId), eq(service.status, status))
      : eq(service.providerId, providerId);

    const rows = await db
      .select({
        id: service.id,
        providerId: service.providerId,
        categoryId: service.categoryId,
        categoryCode: category.code,
        sourceLocale: service.sourceLocale,
        locationType: service.locationType,
        bookingMode: service.bookingMode,
        status: service.status,
        imageKeys: service.imageKeys,
        sortOrder: service.sortOrder,
        createdAt: service.createdAt,
      })
      .from(service)
      .innerJoin(category, eq(category.id, service.categoryId))
      .where(where)
      .orderBy(asc(service.sortOrder), asc(service.createdAt));

    if (rows.length === 0) return [];

    const serviceIds = rows.map((r) => r.id);

    const options = await db
      .select()
      .from(serviceOption)
      .where(inArray(serviceOption.serviceId, serviceIds));
    const translations = await db
      .select()
      .from(serviceTranslation)
      .where(inArray(serviceTranslation.serviceId, serviceIds));
    const quoteForms = await db
      .select()
      .from(serviceQuoteForm)
      .where(inArray(serviceQuoteForm.serviceId, serviceIds));

    const optionIds = options.map((o) => o.id);
    const optionTranslations = optionIds.length
      ? await db
          .select()
          .from(serviceOptionTranslation)
          .where(inArray(serviceOptionTranslation.optionId, optionIds))
      : [];

    return rows.map((r) => ({
      ...r,
      options: options
        .filter((o) => o.serviceId === r.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => ({
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
          translations: optionTranslations
            .filter((t) => t.optionId === o.id)
            .map((t) => ({ locale: t.locale, name: t.name })),
        })),
      translations: translations
        .filter((t) => t.serviceId === r.id)
        .map((t) => ({ locale: t.locale, name: t.name, description: t.description })),
      quoteForm: quoteForms
        .filter((q) => q.serviceId === r.id)
        .map((q) => ({
          responseHours: q.responseHours,
          askDeadline: q.askDeadline,
          askPhotos: q.askPhotos,
          askLocation: q.askLocation,
          intro: q.intro,
        }))
        .at(0) ?? null,
    }));
  }

  async isProviderMember(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }
}
