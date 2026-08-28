import { and, asc, eq, gte, ilike, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  provider,
  providerDocument,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import {
  category,
  categoryTranslation,
  service,
  serviceOption,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { review } from "../../../../../shared/infrastructure/database/review/schemas";
import { memberAvailability } from "../../../../../shared/infrastructure/database/scheduling/schemas/member-availability.schema";
import { mediaUrl } from "../../../../../shared/infrastructure/media/media-url";
import { weeklyHoursFromRows } from "../../../app/use-cases/weekly-hours";
import type {
  ListActiveFilters,
  ProviderPage,
  ProviderPublicRepositoryPort,
} from "../../../app/ports/outbound/provider-public.repository.port";
import type { ProviderPublicDetailDTO, WeeklyHoursDTO } from "@ntizo/shared/read-models";

/**
 * A term as literal text inside a LIKE pattern, with no wildcards of its own.
 *
 * Without this, a search for "100%" matches every provider and "_" matches all
 * of them too — those wildcards are the user's typing, not their intent.
 * Postgres treats backslash as LIKE's escape character by default, so the
 * backslash itself is escaped first or it would escape the escapes.
 *
 * Separate from `likePattern` because not every ILIKE here is a search: the
 * city is matched *exactly*, case-insensitively, and so needs the escaping
 * without the surrounding `%`.
 *
 * The twin of `escapeLike` in the catalog read repository, copied rather than
 * imported for the same reason the aggregates there are — a public read
 * adapter does not reach into a bounded context.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Wraps a search term in a LIKE pattern, escaping the metacharacters first.
 *
 * Exported for its own test: the behaviour is invisible from the outside until
 * someone searches for a percent sign.
 */
export function likePattern(term: string): string {
  return `%${escapeLike(term)}%`;
}

/**
 * The four aggregates a directory card carries, plus a fifth that only the
 * detail page joins — `locations`, for `serviceLocationTypes`. It is grouped
 * and shaped the same way as the other four, but `listActive` never joins it:
 * the directory must not grow a join the list itself does not display.
 *
 * All five as grouped subqueries.
 *
 * **Not correlated subqueries written with `sql`.** That was the first attempt
 * and it does not work: drizzle's `sql` template interpolates a column as its
 * bare name, so `${provider.id}` inside a subquery emits `"id"` rather than
 * `"provider"."id"`, and every one of them failed with `column reference "id"
 * is ambiguous`. Built through the query builder instead, where drizzle
 * qualifies each reference against the subquery's own alias.
 *
 * Each is grouped to one row per provider before it is joined, so the joins
 * cannot multiply rows against each other and the outer query needs no
 * `GROUP BY` over every selected provider column to undo the damage.
 *
 * Inside a subquery, `sql` fragments only ever name columns that belong to a
 * single one of its tables — `amount_minor` and `currency` are `service_option`
 * alone, `provider_id` is `service` alone — so the bare names drizzle emits
 * there are unambiguous. That is a rule to keep, not a coincidence.
 */
function aggregates() {
  const db = getDb();

  const reviews = db
    .select({
      providerId: review.providerId,
      average: sql<string | null>`avg(${review.rating})`.as("review_avg"),
      count: sql<number>`count(*)`.as("review_count"),
    })
    .from(review)
    .where(eq(review.status, "published"))
    .groupBy(review.providerId)
    .as("review_agg");

  // Counted over `service` alone. Counting it in the price aggregate below
  // would count one row per *option*, so a service with three packages would
  // read as three services.
  const services = db
    .select({
      providerId: service.providerId,
      count: sql<number>`count(*)`.as("service_count"),
    })
    .from(service)
    .where(eq(service.status, "published"))
    .groupBy(service.providerId)
    .as("service_agg");

  const prices = db
    .select({
      providerId: service.providerId,
      minAmount: sql<number | null>`min(${serviceOption.amountMinor})`.as("from_amount"),
      // The currency *of the cheapest option*, not an arbitrary one: a business
      // pricing in two currencies would otherwise print the lowest number
      // against the wrong symbol.
      currency: sql<
        string | null
      >`(array_agg(${serviceOption.currency} order by ${serviceOption.amountMinor} asc))[1]`.as("from_currency"),
    })
    .from(serviceOption)
    .innerJoin(service, eq(service.id, serviceOption.serviceId))
    .where(and(eq(service.status, "published"), eq(serviceOption.isActive, true)))
    .groupBy(service.providerId)
    .as("price_agg");

  const verified = db
    .selectDistinct({ providerId: sql<string>`${providerDocument.providerId}`.as("verified_provider_id") })
    .from(providerDocument)
    .where(eq(providerDocument.status, "accepted"))
    .as("verified_agg");

  // Where this business actually works, from what it publishes rather than
  // from what it declares — the same rule `categories` follows. Aggregated
  // over a distinct set, so a provider with six at-home services contributes
  // "at_customer" once.
  //
  // `json_agg`, not `array_agg`, and the difference is not cosmetic. A raw
  // `sql<string[]>` expression carries no column type for the driver to
  // dispatch on, so a Postgres `text[]` came back as its own literal —
  // the string `"{at_customer,remote}"`, not an array. TypeScript believed
  // the annotation, every unit test handed `toDTO` a real array by hand, and
  // the whole suite stayed green while `provider.bySlug` answered
  // INTERNAL_ERROR against a live database: "expected array, received string".
  // `json` is unambiguous on the wire and every driver parses it into a real
  // value, so the annotation stops being a promise nobody checks.
  const locations = db
    .select({
      providerId: service.providerId,
      types: sql<
        string[] | null
      >`json_agg(distinct ${service.locationType})`.as("location_types"),
    })
    .from(service)
    .where(eq(service.status, "published"))
    .groupBy(service.providerId)
    .as("location_agg");

  return { reviews, services, prices, verified, locations };
}

type Aggregates = ReturnType<typeof aggregates>;

/**
 * Public read repository.
 *
 * The column list is the security boundary, not the DTO. Selecting `*` and
 * mapping to the narrow DTO would work today and leak the day someone adds a
 * field to the mapper — so the projection is pushed into the SELECT itself:
 * `ownerUserId`, the street, the postal code and the coordinates are never read
 * out of the database at all.
 */
export class DrizzleProviderPublicRepository implements ProviderPublicRepositoryPort {
  private static readonly COLUMNS = {
    id: provider.id,
    name: provider.name,
    slug: provider.slug,
    type: provider.type,
    description: provider.description,
    city: provider.addressCity,
    district: provider.addressDistrict,
    country: provider.addressCountry,
    logoKey: provider.logoKey,
    photoKeys: provider.photoKeys,
    createdAt: provider.createdAt,
  };

  /**
   * The joined columns, selected as themselves.
   *
   * No `sql` wrapper anywhere in here — not even a `coalesce`. A `sql` template
   * emits a joined column by its bare alias, and two subqueries that both
   * aliased theirs `count` produced `column reference "count" is ambiguous`.
   * Every alias above is unique for the same reason, and the two things a
   * wrapper would have done — defaulting a missing count to zero, turning the
   * verified join into a boolean — are done in `toDTO`, where they cost
   * nothing and cannot collide.
   */
  private static aggregateColumns(agg: Aggregates) {
    return {
      ratingAverage: agg.reviews.average,
      reviewCount: agg.reviews.count,
      serviceCount: agg.services.count,
      fromAmountMinor: agg.prices.minAmount,
      fromCurrency: agg.prices.currency,
      /** Null when the left join found nothing — a business with no accepted document. */
      verifiedProviderId: agg.verified.providerId,
    };
  }

  /**
   * The private-to-public boundary, named field by field rather than built
   * with `...row`. A spread makes the public surface default-open: the next
   * column added to `COLUMNS` would reach an anonymous caller with no test
   * turning red. This is the last thing standing between a row that
   * deliberately selects private columns (`logoKey`, `createdAt`) and that
   * caller, so it lists what leaves rather than what to hold back.
   */
  private static toDTO(
    row: {
      id: string; name: string; slug: string; type: string;
      description: string | null; city: string | null;
      district: string | null; country: string | null; logoKey: string | null;
      photoKeys: string[] | null;
      ratingAverage: string | null; reviewCount: number | null; serviceCount: number | null;
      fromAmountMinor: number | null; fromCurrency: string | null;
      verifiedProviderId: string | null;
      createdAt: Date;
      // Optional, not required: `listActive`'s select never joins the
      // location aggregate — the directory must not grow that join — so its
      // rows simply lack the field. `findActiveBySlug` is the only caller
      // that ever supplies it.
      locationTypes?: string[] | null;
    },
    categories: { code: string; name: string }[],
    weeklyHours: WeeklyHoursDTO[],
  ): ProviderPublicDetailDTO {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type as ProviderPublicDTO["type"],
      description: row.description,
      city: row.city,
      district: row.district,
      country: row.country,
      logoUrl: mediaUrl(row.logoKey),
      // A key with nowhere to be served from resolves to null, and a null in a
      // list of image URLs is a broken tile — dropped rather than rendered.
      photoUrls: (row.photoKeys ?? []).map(mediaUrl).filter((url): url is string => url !== null),
      // Rounded to one decimal at the edge, because that is the only precision
      // anything displays — shipping 4.833333 invites two clients to round it
      // differently and show different scores for the same business.
      ratingAverage: row.ratingAverage === null ? null : Math.round(Number(row.ratingAverage) * 10) / 10,
      // `?? 0`, not `Number(null)`: a business nobody has reviewed has no row
      // in the aggregate at all, and `Number(null)` is 0 only by accident of
      // coercion — `Number(undefined)` beside it would be NaN.
      reviewCount: Number(row.reviewCount ?? 0),
      serviceCount: Number(row.serviceCount ?? 0),
      fromAmountMinor: row.fromAmountMinor === null ? null : Number(row.fromAmountMinor),
      fromCurrency: row.fromCurrency,
      verified: row.verifiedProviderId !== null,
      categories,
      // Year-month only. `toISOString().slice(0, 7)` rather than a locale
      // format: this is a machine value the reader's own `Intl` turns into
      // "Março 2025", so the server never picks a language.
      memberSince: row.createdAt.toISOString().slice(0, 7),
      // `array_agg` returns null for a provider with no published services,
      // and an empty list is the honest reading of that.
      serviceLocationTypes: row.locationTypes ?? [],
      weeklyHours,
    };
  }

  /**
   * The trades each of these businesses publishes in, named in one language.
   *
   * A second query rather than a fifth aggregate: the names live in
   * `category_translation`, and folding a per-locale join with a fallback into
   * the page query would make it a `GROUP BY` over translated strings for no
   * gain. One extra round trip for the whole page, keyed by provider.
   *
   * The fallback chain is the reader's language, then any language, then the
   * bare code — a category with no name in the reader's locale must not vanish
   * from the card, because the *filter* it drives still matches it.
   */
  private async categoriesFor(
    providerIds: string[],
    locale: string,
  ): Promise<Map<string, { code: string; name: string }[]>> {
    const byProvider = new Map<string, { code: string; name: string }[]>();
    if (providerIds.length === 0) return byProvider;

    const rows = await getDb()
      .select({
        providerId: service.providerId,
        code: category.code,
        name: sql<string>`coalesce(
          max(${categoryTranslation.name}) filter (where ${categoryTranslation.locale} = ${locale}),
          max(${categoryTranslation.name}),
          max(${category.code}))`,
      })
      .from(service)
      .innerJoin(category, eq(category.id, service.categoryId))
      .leftJoin(categoryTranslation, eq(categoryTranslation.categoryId, category.id))
      .where(and(inArray(service.providerId, providerIds), eq(service.status, "published")))
      .groupBy(service.providerId, category.code);

    for (const row of rows) {
      const list = byProvider.get(row.providerId) ?? [];
      list.push({ code: row.code, name: row.name });
      byProvider.set(row.providerId, list);
    }
    // Alphabetical inside a card, so two cards showing the same two trades show
    // them in the same order.
    for (const list of byProvider.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return byProvider;
  }

  /** Everything that narrows the list, shared by the page query and its count. */
  private static wheres(filters: ListActiveFilters, agg: Aggregates): SQL[] {
    const wheres: SQL[] = [eq(provider.status, "active")];

    if (filters.search) {
      const pattern = likePattern(filters.search);
      // Only across fields the public DTO already exposes. Searching a column
      // this repository deliberately never selects — the street, the owner —
      // would leak it: a caller could confirm a hidden value by whether a row
      // comes back.
      const match = or(
        ilike(provider.name, pattern),
        ilike(provider.addressCity, pattern),
        ilike(provider.description, pattern),
      );
      if (match) wheres.push(match);
    }
    if (filters.city) {
      // `ilike` and not `eq`, the same match `conditionsFor` makes on the
      // services side: the city arrives from a free-text combobox
      // (`CitySelect` lets people type their own), and both pages now show
      // that one control, so "maputo" and "Maputo" have to be one place here
      // too. With `eq`, the identical link returned businesses on one page
      // and nothing on the other.
      //
      // Escaped, and no `%` of our own around it: an exact match that ignores
      // case, not a prefix search — `%` and `_` are ILIKE's metacharacters, so
      // unescaped `?city=M%` would quietly become one.
      wheres.push(ilike(provider.addressCity, escapeLike(filters.city)));
    }
    if (filters.type) wheres.push(eq(provider.type, filters.type));
    if (filters.verifiedOnly) wheres.push(isNotNull(agg.verified.providerId));

    if (filters.categoryCode) {
      // `inArray` over a builder subquery rather than a `sql` EXISTS: the
      // builder qualifies its own references, which a hand-written fragment
      // does not — see the note on `aggregates()`.
      wheres.push(
        inArray(
          provider.id,
          getDb()
            .selectDistinct({ providerId: service.providerId })
            .from(service)
            .innerJoin(category, eq(category.id, service.categoryId))
            .where(and(eq(service.status, "published"), eq(category.code, filters.categoryCode))),
        ),
      );
    }

    // A business with nothing priced has no "from" to compare, so a price bound
    // excludes it rather than treating a missing price as free.
    if (filters.minPriceMinor != null) wheres.push(gte(agg.prices.minAmount, filters.minPriceMinor));
    if (filters.maxPriceMinor != null) wheres.push(lte(agg.prices.minAmount, filters.maxPriceMinor));
    // Likewise a business nobody has reviewed has no average: it fails a
    // minimum-rating filter rather than being scored zero, which would be
    // inventing a bad review it never got.
    if (filters.minRating != null) wheres.push(gte(agg.reviews.average, String(filters.minRating)));

    return wheres;
  }

  private static orderBy(sort: ListActiveFilters["sort"], agg: Aggregates): SQL[] {
    switch (sort) {
      case "rating":
        // `nulls last`, so the unreviewed sink rather than heading a list
        // ordered by a score they do not have.
        return [sql`${agg.reviews.average} desc nulls last`, asc(provider.name)];
      case "reviews":
        return [sql`${agg.reviews.count} desc nulls last`, asc(provider.name)];
      case "price":
        return [sql`${agg.prices.minAmount} asc nulls last`, asc(provider.name)];
      case "name":
        return [asc(provider.name)];
      default:
        // What the platform puts first when nobody asked: checked businesses,
        // then the better reviewed, then alphabetically so the order is stable
        // between two identical requests.
        return [
          // Postgres sorts DESC as NULLS FIRST, so the businesses *without* an
          // accepted document would lead a list meant to promote the ones with
          // one. The comparison is written out rather than relying on that.
          sql`(${agg.verified.providerId} is not null) desc`,
          sql`${agg.reviews.average} desc nulls last`,
          asc(provider.name),
        ];
    }
  }

  async listActive(filters: ListActiveFilters): Promise<ProviderPage> {
    const db = getDb();
    const agg = aggregates();
    const wheres = DrizzleProviderPublicRepository.wheres(filters, agg);

    const rows = await db
      .select({
        ...DrizzleProviderPublicRepository.COLUMNS,
        ...DrizzleProviderPublicRepository.aggregateColumns(agg),
      })
      .from(provider)
      .leftJoin(agg.reviews, eq(agg.reviews.providerId, provider.id))
      .leftJoin(agg.services, eq(agg.services.providerId, provider.id))
      .leftJoin(agg.prices, eq(agg.prices.providerId, provider.id))
      .leftJoin(agg.verified, eq(agg.verified.providerId, provider.id))
      .where(and(...wheres))
      .orderBy(...DrizzleProviderPublicRepository.orderBy(filters.sort, agg))
      .limit(filters.limit)
      .offset(filters.offset);

    // Counted with the same predicates and none of the paging, so the number
    // above the grid is how many match rather than how many are on screen. The
    // same four joins, spelled again rather than shared through a helper: a
    // generic "add the joins" wrapper only typechecks behind casts, and a cast
    // here would hide the day the two queries stopped agreeing.
    const [counted] = await db
      .select({ total: sql<number>`count(*)` })
      .from(provider)
      .leftJoin(agg.reviews, eq(agg.reviews.providerId, provider.id))
      .leftJoin(agg.services, eq(agg.services.providerId, provider.id))
      .leftJoin(agg.prices, eq(agg.prices.providerId, provider.id))
      .leftJoin(agg.verified, eq(agg.verified.providerId, provider.id))
      .where(and(...wheres));

    const categories = await this.categoriesFor(
      rows.map((r) => r.id),
      filters.locale,
    );

    return {
      // `[]` for weekly hours: the directory renders 24 cards a page and must
      // not pay for a join over every member's availability just to show a
      // list it never displays hours on. `serviceLocationTypes`, `weeklyHours`
      // and `memberSince` all ride along on the return type — the last one
      // because `createdAt` is in `COLUMNS` for `findActiveBySlug`'s benefit —
      // but are dropped at the GraphQL edge, which still answers `provider.list`
      // with `ProviderPublicDTO` alone.
      items: rows.map((r) => DrizzleProviderPublicRepository.toDTO(r, categories.get(r.id) ?? [], [])),
      total: Number(counted?.total ?? 0),
    };
  }

  async findActiveBySlug(slug: string, locale: string): Promise<ProviderPublicDetailDTO | null> {
    const db = getDb();
    const agg = aggregates();

    const [row] = await db
      .select({
        ...DrizzleProviderPublicRepository.COLUMNS,
        ...DrizzleProviderPublicRepository.aggregateColumns(agg),
        locationTypes: agg.locations.types,
      })
      .from(provider)
      .leftJoin(agg.reviews, eq(agg.reviews.providerId, provider.id))
      .leftJoin(agg.services, eq(agg.services.providerId, provider.id))
      .leftJoin(agg.prices, eq(agg.prices.providerId, provider.id))
      .leftJoin(agg.verified, eq(agg.verified.providerId, provider.id))
      .leftJoin(agg.locations, eq(agg.locations.providerId, provider.id))
      // `status = active` is part of the lookup, not a filter applied after —
      // so an inactive provider can never be returned by a slug that matches.
      .where(and(eq(provider.slug, slug), eq(provider.status, "active")))
      .limit(1);

    if (!row) return null;
    const categories = await this.categoriesFor([row.id], locale);
    // Every member's rules for this business, unioned into seven days by
    // `weeklyHoursFromRows`. A second round trip rather than a sixth join:
    // this is one row per member per weekday, and folding it into the
    // aggregate above would multiply the single provider row it decorates.
    const rules = await db
      .select({
        weekday: memberAvailability.weekday,
        startMinute: memberAvailability.startMinute,
        endMinute: memberAvailability.endMinute,
      })
      .from(memberAvailability)
      .where(eq(memberAvailability.providerId, row.id));

    return DrizzleProviderPublicRepository.toDTO(
      row,
      categories.get(row.id) ?? [],
      weeklyHoursFromRows(rules),
    );
  }

  /**
   * The cities that currently have a listed business, with how many.
   *
   * Read from the data rather than from the reference `city` table, because the
   * filter must never offer a city that returns nothing: a chip labelled
   * "Nampula 0" is a control whose only outcome is an empty page.
   */
  async listCityFacets(): Promise<{ city: string; count: number }[]> {
    const rows = await getDb()
      .select({ city: provider.addressCity, count: sql<number>`count(*)` })
      .from(provider)
      // Blank as well as null. A provider row can carry `''` for a city that
      // was never filled in, and it reaches the filter as a chip with no label
      // — a control whose only outcome is an empty page, which is exactly what
      // reading the facets from the data instead of the reference table was
      // meant to avoid.
      .where(
        and(
          eq(provider.status, "active"),
          isNotNull(provider.addressCity),
          sql`btrim(${provider.addressCity}) <> ''`,
        ),
      )
      .groupBy(provider.addressCity)
      .orderBy(asc(provider.addressCity));

    return rows
      .filter((r): r is { city: string; count: number } => r.city !== null)
      .map((r) => ({ city: r.city, count: Number(r.count) }));
  }
}
