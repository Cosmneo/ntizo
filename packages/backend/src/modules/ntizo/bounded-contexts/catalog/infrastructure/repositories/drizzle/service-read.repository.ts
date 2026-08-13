import { and, asc, count, desc, eq, exists, gte, ilike, inArray, lte, min, or, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  category,
  categoryTranslation,
  service,
  serviceMember,
  serviceOption,
  serviceOptionTranslation,
  serviceQuoteForm,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { provider, providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type {
  ListPublishedServicesFilter,
  ServiceDetailRow,
  ServiceOwnerRow,
  ServicePublicRow,
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
    // Who performs each service — the same table `service.repository.ts`
    // (write side) reads to hydrate the aggregate, queried here separately
    // for the same reason as `options`/`translations` above: a join would
    // multiply a service row per performer.
    const members = await db
      .select()
      .from(serviceMember)
      .where(inArray(serviceMember.serviceId, serviceIds));

    const optionIds = options.map((o) => o.id);
    const optionTranslations = optionIds.length
      ? await db
          .select()
          .from(serviceOptionTranslation)
          .where(inArray(serviceOptionTranslation.optionId, optionIds))
      : [];

    return rows.map((r) => ({
      ...r,
      memberIds: members.filter((m) => m.serviceId === r.id).map((m) => m.memberId),
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

  /**
   * Published services of active providers, paged.
   *
   * `category` and `provider` are joined directly rather than aggregated: a
   * service has exactly one of each, so neither join can multiply a row the
   * way `serviceTranslation` would. `providerStatus` comes from that join —
   * live off the `provider` row, on every call — rather than from a column on
   * `service`, which is what lets the projection's "published AND active"
   * rule mean something instead of trusting a snapshot that can go stale the
   * moment a provider is suspended.
   *
   * Translations and the default option are fetched in two further queries
   * keyed by the ids this page already picked, the same reason
   * `listForProvider` does it: joining a one-to-many here would multiply the
   * very rows `limit`/`offset` just paged.
   *
   * `providerId`, when given, scopes the page to one business — the filter a
   * provider's own public page needs, threaded through exactly like
   * `categoryCode`.
   */
  async listPublished(filter: ListPublishedServicesFilter): Promise<ServicePublicRow[]> {
    const db = getDb();
    const conditions = [eq(service.status, "published"), eq(provider.status, "active")];
    if (filter.categoryCode) conditions.push(eq(category.code, filter.categoryCode));
    if (filter.providerId) conditions.push(eq(service.providerId, filter.providerId));
    if (filter.locationType) conditions.push(eq(service.locationType, filter.locationType));
    if (filter.providerType) conditions.push(eq(provider.type, filter.providerType));
    if (filter.paymentMode === "quote") {
      conditions.push(eq(service.bookingMode, "quote"));
    } else if (filter.paymentMode === "fixed" || filter.paymentMode === "hourly") {
      // Two conditions, not one. `bookingMode` alone would let a `quote`
      // service through if it somehow carried an option, and the option alone
      // would match a service whose default was archived out from under it.
      conditions.push(eq(service.bookingMode, "priced"));
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(serviceOption)
            .where(
              and(
                eq(serviceOption.serviceId, service.id),
                eq(serviceOption.isDefault, true),
                eq(serviceOption.pricingMode, filter.paymentMode),
              ),
            ),
        ),
      );
    }
    if (filter.language) {
      // EXISTS with a non-blank name, not just a row: a translation record can
      // exist with an empty name while the provider is midway through filling
      // it in, and offering that service under "readable in French" is the one
      // thing this filter promises not to do.
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(serviceTranslation)
            .where(
              and(
                eq(serviceTranslation.serviceId, service.id),
                eq(serviceTranslation.locale, filter.language),
                sql`length(trim(${serviceTranslation.name})) > 0`,
              ),
            ),
        ),
      );
    }
    if (filter.minPriceMinor !== undefined || filter.maxPriceMinor !== undefined) {
      // Against the cheapest active option, which is the number the card
      // prints as "from". A quote service has no options and so matches no
      // price bound at all — which is correct: it has no price to compare.
      const bounds = [eq(serviceOption.serviceId, service.id), eq(serviceOption.isActive, true)];
      if (filter.minPriceMinor !== undefined) {
        bounds.push(gte(serviceOption.amountMinor, filter.minPriceMinor));
      }
      if (filter.maxPriceMinor !== undefined) {
        bounds.push(lte(serviceOption.amountMinor, filter.maxPriceMinor));
      }
      conditions.push(
        exists(db.select({ one: sql`1` }).from(serviceOption).where(and(...bounds))),
      );
    }
    if (filter.q) {
      const pattern = `%${escapeLike(filter.q)}%`;
      // An EXISTS rather than a join, for the same reason the translations are
      // fetched separately below: `service_translation` is one-to-many, and
      // joining it would multiply the very rows `limit`/`offset` then page.
      // EXISTS asks whether any translation matches without producing one.
      //
      // Every language, not the reader's: somebody browsing in Portuguese can
      // still type an English word. The card shows whatever their own locale
      // resolves to, which may not be the text that matched — a trade this
      // makes deliberately, because not finding the service is worse.
      const matchesText = or(
        // The provider's name too. The card already shows it, so a service
        // returned for its provider's sake carries its own explanation;
        // matching on something invisible would read as a bug.
        ilike(provider.name, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(serviceTranslation)
            .where(
              and(
                eq(serviceTranslation.serviceId, service.id),
                or(
                  ilike(serviceTranslation.name, pattern),
                  ilike(serviceTranslation.description, pattern),
                ),
              ),
            ),
        ),
      );
      // `or` is typed as possibly undefined because it tolerates undefined
      // arguments; neither of these two is one.
      if (matchesText) conditions.push(matchesText);
    }

    const rows = await db
      .select({
        id: service.id,
        providerId: service.providerId,
        providerName: provider.name,
        providerSlug: provider.slug,
        providerStatus: provider.status,
        providerType: provider.type,
        categoryId: category.id,
        categoryCode: category.code,
        status: service.status,
        sourceLocale: service.sourceLocale,
        locationType: service.locationType,
        bookingMode: service.bookingMode,
        imageKeys: service.imageKeys,
      })
      .from(service)
      .innerJoin(category, eq(category.id, service.categoryId))
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(and(...conditions))
      // `newest` ignores `sortOrder` rather than ordering within it: the
      // provider's own arrangement is an answer to "what do I want shown
      // first", and a reader who asked for the newest is asking a different
      // question that their arrangement should not override.
      .orderBy(
        ...(filter.sort === "newest"
          ? [desc(service.createdAt)]
          : [asc(service.sortOrder), asc(service.createdAt)]),
      )
      .limit(filter.limit)
      .offset(filter.offset);

    if (rows.length === 0) return [];

    const serviceIds = rows.map((r) => r.id);

    const translations = await db
      .select()
      .from(serviceTranslation)
      .where(inArray(serviceTranslation.serviceId, serviceIds));

    // Fetched by id rather than joined, for the reason the class comment
    // gives: `category_translation` is one-to-many, and joining it would
    // multiply every service row by the number of languages its category is
    // written in. Deduplicated first — twelve services across three
    // categories asks for three, not twelve.
    const categoryIds = [...new Set(rows.map((r) => r.categoryId))];
    const categoryTranslations = await db
      .select()
      .from(categoryTranslation)
      .where(inArray(categoryTranslation.categoryId, categoryIds));

    // The cheapest active option and how many there are, in one grouped pass
    // rather than by pulling every option back and reducing in JS. What the
    // card needs is two numbers per service, not the options themselves — the
    // options belong to the service's own page.
    const priceAgg = await db
      .select({
        serviceId: serviceOption.serviceId,
        fromAmountMinor: min(serviceOption.amountMinor),
        optionCount: count(),
      })
      .from(serviceOption)
      .where(
        and(inArray(serviceOption.serviceId, serviceIds), eq(serviceOption.isActive, true)),
      )
      .groupBy(serviceOption.serviceId);

    // At most one per service — the partial unique index on `is_default`
    // guarantees it — so this is a lookup by `serviceId`, not another
    // one-to-many relation to reconcile.
    const defaults = await db
      .select()
      .from(serviceOption)
      .where(
        and(inArray(serviceOption.serviceId, serviceIds), eq(serviceOption.isDefault, true)),
      );

    return rows.map((r) => {
      const opt = defaults.find((o) => o.serviceId === r.id);
      // `categoryId` was selected only to key this lookup; it is not part of
      // the row the port promises, so it is dropped rather than spread.
      const { categoryId, ...rest } = r;
      const agg = priceAgg.find((a) => a.serviceId === r.id);
      return {
        ...rest,
        // `min()` comes back as a string from Postgres for a bigint column, and
        // as null when the group is empty. Neither is a number, and a string
        // would compare and format wrongly all the way to the card.
        fromAmountMinor:
          agg?.fromAmountMinor === null || agg?.fromAmountMinor === undefined
            ? null
            : Number(agg.fromAmountMinor),
        optionCount: agg?.optionCount ?? 0,
        categoryTranslations: categoryTranslations
          .filter((t) => t.categoryId === categoryId)
          .map((t) => ({ locale: t.locale, name: t.name, description: null })),
        defaultOption: opt
          ? {
              amountMinor: opt.amountMinor,
              currency: opt.currency,
              durationMinutes: opt.durationMinutes,
              minMinutes: opt.minMinutes,
              stepMinutes: opt.stepMinutes,
              pricingMode: opt.pricingMode,
            }
          : null,
        translations: translations
          .filter((t) => t.serviceId === r.id)
          .map((t) => ({ locale: t.locale, name: t.name, description: t.description })),
      };
    });
  }

  async getPublishedById(id: string): Promise<ServiceDetailRow | null> {
    const db = getDb();
    const [row] = await db
      .select({
        id: service.id,
        providerId: service.providerId,
        providerName: provider.name,
        providerSlug: provider.slug,
        providerStatus: provider.status,
        providerType: provider.type,
        providerLogoKey: provider.logoKey,
        providerCity: provider.addressCity,
        providerDistrict: provider.addressDistrict,
        categoryId: category.id,
        categoryCode: category.code,
        status: service.status,
        sourceLocale: service.sourceLocale,
        locationType: service.locationType,
        bookingMode: service.bookingMode,
        imageKeys: service.imageKeys,
      })
      .from(service)
      .innerJoin(category, eq(category.id, service.categoryId))
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(eq(service.id, id))
      .limit(1);

    if (!row) return null;

    const [translations, categoryTranslations, options, members] = await Promise.all([
      db.select().from(serviceTranslation).where(eq(serviceTranslation.serviceId, id)),
      db.select().from(categoryTranslation).where(eq(categoryTranslation.categoryId, row.categoryId)),
      db
        .select()
        .from(serviceOption)
        .where(and(eq(serviceOption.serviceId, id), eq(serviceOption.isActive, true)))
        .orderBy(asc(serviceOption.amountMinor)),
      db.select().from(serviceMember).where(eq(serviceMember.serviceId, id)),
    ]);

    const optionIds = options.map((o) => o.id);
    const optionTranslations = optionIds.length
      ? await db
          .select()
          .from(serviceOptionTranslation)
          .where(inArray(serviceOptionTranslation.optionId, optionIds))
      : [];

    const { categoryId, ...rest } = row;
    return {
      ...rest,
      // The page's own chooser lists cheapest first, which is also the order
      // the "from" price on the browse card is taken from. One order, so the
      // number a reader arrived expecting is the first one they see here.
      options: options.map((o) => ({
        id: o.id,
        amountMinor: o.amountMinor,
        currency: o.currency,
        durationMinutes: o.durationMinutes,
        minMinutes: o.minMinutes,
        stepMinutes: o.stepMinutes,
        pricingMode: o.pricingMode,
        isDefault: o.isDefault,
        sortOrder: o.sortOrder,
        translations: optionTranslations
          .filter((t) => t.optionId === o.id)
          .map((t) => ({ locale: t.locale, name: t.name })),
      })),
      memberIds: members.map((m) => m.memberId),
      categoryTranslations: categoryTranslations.map((t) => ({
        locale: t.locale,
        name: t.name,
        description: null,
      })),
      translations: translations.map((t) => ({
        locale: t.locale,
        name: t.name,
        description: t.description,
      })),
      // The card's own fields, unused by the detail page but part of the row
      // it extends. `defaultOption` is the one marked default; the aggregate
      // pair are derived from the options already fetched.
      defaultOption: (() => {
        const d = options.find((o) => o.isDefault);
        return d
          ? {
              amountMinor: d.amountMinor,
              currency: d.currency,
              durationMinutes: d.durationMinutes,
              minMinutes: d.minMinutes,
              stepMinutes: d.stepMinutes,
              pricingMode: d.pricingMode,
            }
          : null;
      })(),
      fromAmountMinor: options.length ? (options[0]?.amountMinor ?? null) : null,
      optionCount: options.length,
    };
  }
}

/**
 * A search term as literal text inside a `%…%` pattern.
 *
 * `%` and `_` are ILIKE's wildcards — "anything" and "any one character" — so
 * a customer typing `100%` would otherwise match every published service on
 * the platform, and `m_nicure` would find "Manicure". Neither is an injection
 * (Drizzle binds the pattern as a parameter); both are simply the wrong
 * results, which is harder to notice.
 *
 * The backslash goes first, or escaping `%` would then escape the backslash
 * this function just added. No `ESCAPE` clause is needed: backslash is
 * Postgres's default for LIKE and ILIKE.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
