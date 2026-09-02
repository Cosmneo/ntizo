import { and, asc, count, desc, eq, exists, gte, ilike, inArray, isNotNull, lte, min, or, sql } from "drizzle-orm";
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
import {
  provider,
  providerDocument,
  providerMember,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import { review } from "../../../../../shared/infrastructure/database/review/schemas";
import type {
  ListPublishedServicesFilter,
  ServiceDetailRow,
  ServiceOwnerRow,
  ServicePublicRow,
  ServiceReadRepositoryPort,
} from "../../../app/ports/outbound/service-read.repository.port";

/**
 * What `service.id` looks like in this table.
 *
 * Checked here, in the adapter, rather than on the GraphQL input: the
 * database is what defines the id's shape, and to a table keyed by uuid a
 * malformed id already means "no such row" — the same null a well-formed but
 * absent id gets. The alternative is letting Postgres reject the value with a
 * syntax error, which turns a mistyped URL or a crawler probing `/services/x`
 * into a 500 on a page meant to answer "not found".
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The WHERE both `listPublished` and `countPublished` run.
 *
 * Extracted rather than copied: a count built from a second, hand-kept copy
 * of these conditions is a count that will one day disagree with the list
 * above it, and the disagreement shows up as "40 services" over a page of
 * three with no way to tell which number is wrong.
 *
 * A module-level export, not a method on `DrizzleServiceReadRepository`: a
 * later test asserts on the generated SQL via drizzle's `.toSQL()`, and a
 * private method gives that test no seam to call this from.
 */
export function conditionsFor(
  db: ReturnType<typeof getDb>,
  filter: Omit<ListPublishedServicesFilter, "limit" | "offset" | "sort">,
) {
  const conditions = [eq(service.status, "published"), eq(provider.status, "active")];
  if (filter.categoryCode) conditions.push(eq(category.code, filter.categoryCode));
  if (filter.providerId) conditions.push(eq(service.providerId, filter.providerId));
  if (filter.locationType) conditions.push(eq(service.locationType, filter.locationType));
  if (filter.providerType) conditions.push(eq(provider.type, filter.providerType));
  if (filter.city) {
    // A service has no city of its own — it has a `locationType`. The place
    // is the *provider's*, which is right for `at_provider` and
    // `at_customer` work: "in Maputo" means the business is there.
    //
    // It is wrong for `remote`, which has no geography at all, so a remote
    // service matches every city rather than none. Excluding them would
    // silently drop every online listing from a filter the reader believes
    // narrows by where the work happens — and they would have no way to
    // discover it, because the filter's label says "city", not "excludes
    // anything without one".
    conditions.push(
      or(
        eq(service.locationType, "remote"),
        // `ilike` and not `eq`: the city arrives from a free-text combobox
        // (`CitySelect` lets people type their own), so "maputo" and
        // "Maputo" are one place.
        //
        // Escaped, and no `%` of our own around it: this is an exact match
        // that ignores case, not a prefix search — but `%` and `_` are
        // ILIKE's own metacharacters, so without the escape `?city=M%`
        // silently becomes one, matching every city beginning with M.
        ilike(provider.addressCity, escapeLike(filter.city)),
      )!,
    );
  }
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
  return conditions;
}

/**
 * The cheapest active option of the service in the surrounding row.
 *
 * The same rows `priceAgg` groups over further down `listPublished` —
 * `isActive`, and `min(amountMinor)` — written again as a correlated subselect
 * because ordering happens in the query that *pages* the services, and
 * `priceAgg` only runs once that page is already chosen.
 *
 * These two must agree. If they diverge, the browse sorts on one number and
 * prints another, which reads as a sort that does not work and is close to
 * undiagnosable from the page. Changing either means changing both.
 */
const cheapestActiveOption = sql`
  select min(${serviceOption.amountMinor})
  from ${serviceOption}
  where ${serviceOption.serviceId} = ${service.id}
    and ${serviceOption.isActive} = true`;

/**
 * The provider's review score and count, grouped to one row per provider.
 *
 * A copy of `DrizzleProviderPublicRepository.aggregates().reviews`
 * (`public/provider/infra/repositories/drizzle/provider-public.repository.ts`),
 * not an import of it: that repository lives in `public/provider`, this one
 * in `bounded-contexts/catalog`, and importing across that boundary would be
 * a bounded-context violation. **The two copies must change together.**
 *
 * `status = 'published'` is load-bearing here exactly as it is there: without
 * it a card counts reviews an administrator has not published, and the
 * number on the card disagrees with the number on the provider's own page.
 *
 * Exported, the same reason `conditionsFor` above is: a review joined without
 * this `groupBy` would multiply a service row per review, and a private
 * function gives no seam for a test to pin that the `GROUP BY` is still
 * there — see `__tests__/service-read.repository.test.ts`.
 */
export function reviewAggregate(db: ReturnType<typeof getDb>) {
  return db
    .select({
      providerId: review.providerId,
      average: sql<string | null>`avg(${review.rating})`.as("review_avg"),
      count: sql<number>`count(*)`.as("review_count"),
    })
    .from(review)
    .where(eq(review.status, "published"))
    .groupBy(review.providerId)
    .as("review_agg");
}

/**
 * Which providers have at least one document the platform has accepted,
 * one row each.
 *
 * A copy of `DrizzleProviderPublicRepository.aggregates().verified`
 * (`public/provider/infra/repositories/drizzle/provider-public.repository.ts`),
 * not an import of it: that repository lives in `public/provider`, this one
 * in `bounded-contexts/catalog`, and importing across that boundary would be
 * a bounded-context violation. **The two copies must change together.**
 *
 * `selectDistinct` is load-bearing exactly as it is there: a business with
 * three accepted documents must not multiply its service rows. So is
 * `status = "accepted"` — the field means "the platform has accepted at
 * least one of this business's documents", never "this business registered".
 *
 * Exported for the same reason `reviewAggregate` above now is: "true by
 * construction" is exactly the kind of fact a later tidy-up deletes, and
 * nothing seeds `provider_document` in the DB-integration suite to catch it
 * downstream either — see the `SELECT DISTINCT` assertion in
 * `__tests__/service-read.repository.test.ts`.
 */
export function verifiedAggregate(db: ReturnType<typeof getDb>) {
  return db
    .selectDistinct({
      providerId: sql<string>`${providerDocument.providerId}`.as("verified_provider_id"),
    })
    .from(providerDocument)
    .where(eq(providerDocument.status, "accepted"))
    .as("verified_agg");
}

/**
 * Turns `reviewAggregate`'s raw joined columns into what `ServicePublicRow`
 * promises.
 *
 * A module-level export, the same seam `orderByFor` and `conditionsFor`
 * already are: `avg()` returns a string on Postgres, and null on an empty
 * group. Neither is a number, and a string reaching `serviceReadModel` fails
 * output validation for the *whole page*, not the one row — a failure mode
 * worth a direct unit test with no database, not only an inline conversion
 * nobody re-checks.
 *
 * Rounded to one decimal, matching `DrizzleProviderPublicRepository.toDTO`'s
 * `ratingAverage`. `review.rating` is `integer` with a 1–5 CHECK, so `avg()`
 * returns full precision — `4.666666666666667`, not `4.7` — and without
 * rounding here the same business would carry a different number on a
 * service card than on its own provider page. Both happen to *display* as
 * "4.7" today because the card formats with `toFixed(1)`, but they would be
 * different numbers on the wire, and anything that does not format — a test,
 * a future sort, an export — would see one business disagree with itself.
 *
 * `undefined` is treated the same as `null`: a plain object built by hand (a
 * test, a future caller) that simply omits the field must not crash this
 * function, and has nothing to report either.
 */
export function coerceReviewAggregate(row: {
  providerRatingAverage: string | null | undefined;
  providerReviewCount: number | string | null | undefined;
}): { providerRatingAverage: number | null; providerReviewCount: number } {
  return {
    providerRatingAverage:
      row.providerRatingAverage === null || row.providerRatingAverage === undefined
        ? null
        : Math.round(Number(row.providerRatingAverage) * 10) / 10,
    providerReviewCount: Number(row.providerReviewCount ?? 0),
  };
}

/**
 * The `ORDER BY` `listPublished` pages on.
 *
 * A module-level export, not inlined: the same reason `conditionsFor` is
 * exported above — a test asserting `nulls last` needs a seam to call this
 * from, and `listPublished`'s `orderBy` is not one.
 */
export function orderByFor(sort: ListPublishedServicesFilter["sort"]) {
  return sort === "newest"
    ? [desc(service.createdAt)]
    : sort === "price"
      ? [
          // NULLS LAST, spelled out even though ASC already defaults to it:
          // ASC and DESC do not share a default. DESC defaults to NULLS
          // FIRST, so a later "most expensive first" order added by flipping
          // this to desc() would silently move every quote service — the
          // ones with no price at all — to the very top, the one position
          // they cannot honestly hold. Spelling it out here means that
          // change has to touch this clause, not rely on a default that
          // flips with the direction.
          sql`(${cheapestActiveOption}) asc nulls last`,
          // Breaks ties, so two services at 800 MZN do not swap places
          // between requests and reappear on the next page.
          asc(service.createdAt),
        ]
      : [asc(service.sortOrder), asc(service.createdAt)];
}

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
    const conditions = conditionsFor(db, filter);
    const reviewAgg = reviewAggregate(db);
    const verifiedAgg = verifiedAggregate(db);

    const rows = await db
      .select({
        id: service.id,
        providerId: service.providerId,
        providerName: provider.name,
        providerSlug: provider.slug,
        providerStatus: provider.status,
        providerType: provider.type,
        providerRatingAverage: reviewAgg.average,
        providerReviewCount: reviewAgg.count,
        /** Null when the left join found nothing — see `verifiedAggregate`. */
        providerVerifiedId: verifiedAgg.providerId,
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
      // `leftJoin`, never inner: an inner join drops every service whose
      // provider has no reviews, which is most of them.
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, provider.id))
      // `leftJoin` here too, for the same reason: an inner join would drop
      // every service whose provider has no accepted document, which is
      // most of them, and the browse would just get shorter with nothing
      // failing.
      .leftJoin(verifiedAgg, eq(verifiedAgg.providerId, provider.id))
      .where(and(...conditions))
      // `newest` and `price` each ignore `sortOrder` rather than ordering
      // within it: the provider's own arrangement is an answer to "what do I
      // want shown first", and a reader who asked for the newest or the
      // cheapest is asking a different question that their arrangement
      // should not override.
      .orderBy(...orderByFor(filter.sort))
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
      // `categoryId` was selected only to key this lookup, and
      // `providerVerifiedId` only to derive the boolean below; neither is
      // part of the row the port promises, so both are dropped rather than
      // spread.
      const { categoryId, providerVerifiedId, ...rest } = r;
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
        // The way `DrizzleProviderPublicRepository.toDTO` derives the same
        // fact from the same shape of join.
        providerVerified: providerVerifiedId !== null,
        ...coerceReviewAggregate(r),
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

  /**
   * How many rows `listPublished` would page through with this filter,
   * counted with the same joins and the same `conditionsFor` — see that
   * function's doc comment for why the two must never diverge.
   */
  async countPublished(
    filter: Omit<ListPublishedServicesFilter, "limit" | "offset" | "sort">,
  ): Promise<number> {
    const db = getDb();
    const [counted] = await db
      .select({ total: sql<number>`count(*)` })
      .from(service)
      .innerJoin(category, eq(category.id, service.categoryId))
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(and(...conditionsFor(db, filter)));
    // `count(*)` arrives as a string from postgres-js on a bigint; `Number`
    // here rather than at the call site, so nothing downstream sees a string
    // where the read model declares an integer.
    return Number(counted?.total ?? 0);
  }

  async getPublishedById(id: string): Promise<ServiceDetailRow | null> {
    if (!UUID.test(id)) return null;

    const db = getDb();
    // The same two aggregates `listPublished` builds, on this page for the
    // first time: the service page and checkout's rail both print the
    // business's score and its verified badge beside its name. Fetching one
    // row does **not** make either aggregate cheap: both carry a `GROUP BY`
    // or `DISTINCT`, which Postgres cannot correlate to this call's single
    // `provider.id` — there is no parameterized path without `LATERAL` — so
    // `review_agg` hash-aggregates every published review and `verified_agg`
    // distincts every accepted document, in full, on every call, exactly as
    // `listPublished` does for a whole page of rows. Free today because both
    // tables are small; see follow-up #121 for the real fix and why it is
    // not done here.
    const reviewAgg = reviewAggregate(db);
    const verifiedAgg = verifiedAggregate(db);

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
        providerRatingAverage: reviewAgg.average,
        providerReviewCount: reviewAgg.count,
        /** Null when the left join found nothing — see `verifiedAggregate`. */
        providerVerifiedId: verifiedAgg.providerId,
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
      // `leftJoin` on both, never inner, for the reason `listPublished`
      // spells out: an inner join drops a service whose provider has no
      // reviews or no accepted document, which is most of them — and here it
      // would turn a real, published service into a 404.
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, provider.id))
      .leftJoin(verifiedAgg, eq(verifiedAgg.providerId, provider.id))
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

    // Dropped from `rest` on purpose: the read model carries the category's
    // resolved name, not its id. `providerReviewCount` goes the same way —
    // the review join has to select it to be worth running, and
    // `ServiceDetailRow` deliberately does not carry it. `providerVerifiedId`
    // is dropped because the row publishes the boolean derived from it below,
    // not the id. The underscore is the signal base.js defines for
    // "destructured deliberately, and deliberately not used".
    const {
      categoryId: _categoryId,
      providerVerifiedId,
      providerReviewCount: _providerReviewCount,
      ...rest
    } = row;
    return {
      ...rest,
      // `avg()` comes back a string on Postgres and null on an empty group,
      // and neither is the number `serviceDetailReadModel` promises — see
      // `coerceReviewAggregate` for the rounding, which has to match the
      // provider page's or one business carries two different numbers.
      providerRatingAverage: coerceReviewAggregate(row).providerRatingAverage,
      providerVerified: providerVerifiedId !== null,
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

  /**
   * The cities that currently have a published service, with how many.
   *
   * The count is what `?city=…` actually returns, which is **not** the size of
   * the city's own group: `conditionsFor` matches `city OR remote`, so every
   * city link also returns every remote service on the platform. Grouped
   * alone, the sidebar printed "Beira 1" over a link that answered with one
   * service plus every online listing there is — a number that is simply
   * wrong about the destination under it.
   *
   * So it is assembled from the two halves of that predicate: the city's own
   * non-remote services, plus the remote population once. Remote is excluded
   * from the group rather than merely added on, or a remote service whose
   * provider happens to sit in Beira would be counted twice for Beira. The
   * remote half is counted without the city guard below, because a remote
   * service matches `?city=Beira` whether or not its provider filled a city
   * in at all.
   *
   * Every city therefore carries the same remote floor, which is honest about
   * the link and surprising on its own — so the sidebar says so, once, in the
   * city group's `hint` (`filterCityHint`).
   *
   * The blank-string guard is `DrizzleProviderPublicRepository.listCityFacets`'s,
   * and the reason is the same: a provider row can carry `''` for a city
   * nobody filled in, and it would reach the filter as a chip with no label
   * whose only outcome is an empty page. The counting no longer mirrors that
   * one — a provider has a single city, so the directory's facet has no
   * second population to fold in.
   */
  async listCityFacets(): Promise<{ city: string; count: number }[]> {
    const db = getDb();
    const published = and(eq(service.status, "published"), eq(provider.status, "active"));

    const rows = await db
      .select({
        city: provider.addressCity,
        count: sql<number>`count(*) filter (where ${service.locationType} <> 'remote')`,
      })
      .from(service)
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(
        and(published, isNotNull(provider.addressCity), sql`btrim(${provider.addressCity}) <> ''`),
      )
      // Grouped over every published service, remote included, even though
      // only the non-remote ones are counted: a city whose services are all
      // remote still belongs in the list, because its link still returns
      // them. It simply contributes none of its own to the shared floor.
      .groupBy(provider.addressCity)
      .orderBy(asc(provider.addressCity));

    const [remote] = await db
      .select({ count: sql<number>`count(*)` })
      .from(service)
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(and(published, eq(service.locationType, "remote")));
    const remoteCount = Number(remote?.count ?? 0);

    return rows
      .filter((r): r is { city: string; count: number } => r.city !== null)
      .map((r) => ({ city: r.city, count: Number(r.count) + remoteCount }));
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
