import { and, count, desc, eq, ilike, isNotNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { review } from "../../../../../shared/infrastructure/database/review/schemas";
import { provider, providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import { profile } from "../../../../../shared/infrastructure/database/user/schemas";
import { Review } from "../../../domain/aggregates/review.aggregate";
import type {
  AdminReviewRow,
  FeaturedReviewRow,
  ReviewRepositoryPort,
  ReviewRow,
  ReviewSummary,
  UpsertedReview,
} from "../../../app/ports/outbound/review.repository.port";

/** Every score with nobody on it, so a histogram always has five bars. */
const EMPTY_HISTOGRAM: ReviewSummary["histogram"] = {
  one: 0,
  two: 0,
  three: 0,
  four: 0,
  five: 0,
};

export class DrizzleReviewRepository implements ReviewRepositoryPort {
  async findByAuthor(providerId: string, authorUserId: string): Promise<Review | null> {
    const [row] = await getDb()
      .select()
      .from(review)
      .where(and(eq(review.providerId, providerId), eq(review.authorUserId, authorUserId)))
      .limit(1);

    if (!row) return null;
    return Review.create({
      id: row.id,
      providerId: row.providerId,
      authorUserId: row.authorUserId,
      bookingId: row.bookingId,
      rating: row.rating,
      comment: row.comment,
    });
  }

  /**
   * One statement, resolving on the (provider, author) uniqueness.
   *
   * Not read-then-insert-or-update: two submissions racing would both read
   * "nothing here" and the second insert would fail on the constraint with a
   * database error rather than doing what the person asked. `ON CONFLICT DO
   * UPDATE` makes the second one an edit, which is what it is.
   *
   * `updatedAt` is set explicitly because a column default only fires on
   * insert; without this an edited review would keep advertising the date of
   * the verdict it replaced.
   *
   * `inserted` reads Postgres' own `xmax` system column rather than trusting
   * whatever the caller believed going in: it is zero on a row this exact
   * statement inserted and non-zero on one `DO UPDATE` touched, so it is
   * telling the truth about this write specifically — unlike a `findByAuthor`
   * read taken before the transaction, which two racing submissions can both
   * see as "nothing here". See `UpsertedReview`.
   */
  async upsert(entity: Review): Promise<UpsertedReview> {
    const [row] = await getDb()
      .insert(review)
      .values({
        providerId: entity.providerId,
        authorUserId: entity.authorUserId,
        bookingId: entity.bookingId,
        rating: entity.rating,
        comment: entity.comment,
      })
      .onConflictDoUpdate({
        target: [review.providerId, review.authorUserId],
        set: {
          rating: entity.rating,
          comment: entity.comment,
          bookingId: entity.bookingId,
          updatedAt: new Date(),
        },
      })
      .returning({ id: review.id, inserted: sql<boolean>`(xmax = 0)` });

    return { id: row!.id, inserted: row!.inserted };
  }

  async removeOwn(providerId: string, authorUserId: string): Promise<boolean> {
    const deleted = await getDb()
      .delete(review)
      .where(and(eq(review.providerId, providerId), eq(review.authorUserId, authorUserId)))
      .returning({ id: review.id });
    return deleted.length > 0;
  }

  async listPublished(providerId: string, limit: number, offset: number): Promise<ReviewRow[]> {
    const rows = await getDb()
      .select({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        displayName: profile.displayName,
        firstName: profile.firstName,
      })
      .from(review)
      // A left join, not an inner one: a review whose author has no profile row
      // is still a real review, and an inner join would quietly drop it from
      // the list while leaving it in the average computed below.
      .leftJoin(profile, eq(profile.userId, review.authorUserId))
      .where(and(eq(review.providerId, providerId), eq(review.status, "published")))
      .orderBy(desc(review.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      // The display name, else the first name, else nothing — never the email
      // and never the id. This list is public, and an author who set no name
      // has not consented to either being on it.
      authorName: r.displayName?.trim() || r.firstName?.trim() || null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * The reviews on the home page, most recently featured first.
   *
   * Three conditions, and each one is load-bearing:
   *
   * - `featuredAt IS NOT NULL` — an administrator chose this row.
   * - `status = 'published'` — hiding a review must take it off the front page
   *   immediately, without also destroying the choice. The mark stays on the
   *   row; this clause is what stops it being honoured. Unhide, and it is back.
   * - `comment <> ''` — the card is built around the words. A five-star review
   *   with nothing written in it renders as an empty quotation, so it never
   *   comes back here even if somebody featured it. `ne` on the trimmed value
   *   rather than a null check alone: the aggregate normalises `""` to null on
   *   the way in, but nothing has ever normalised the rows written before it
   *   did, and a whitespace-only comment would pass `IS NOT NULL`.
   *
   * The join to `provider` is inner, unlike the profile join: a review is
   * `cascade`-deleted with its provider, so a row that survives without one
   * cannot exist — and if it somehow did, a card naming no business is exactly
   * what must not reach the home page.
   */
  async listFeatured(limit: number): Promise<FeaturedReviewRow[]> {
    const rows = await getDb()
      .select({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        displayName: profile.displayName,
        firstName: profile.firstName,
        providerName: provider.name,
        providerSlug: provider.slug,
      })
      .from(review)
      .innerJoin(provider, eq(provider.id, review.providerId))
      .leftJoin(profile, eq(profile.userId, review.authorUserId))
      .where(
        and(
          isNotNull(review.featuredAt),
          eq(review.status, "published"),
          isNotNull(review.comment),
          ne(sql`btrim(${review.comment})`, ""),
        ),
      )
      .orderBy(desc(review.featuredAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      // Non-null by the WHERE above; the cast is what tells TypeScript what the
      // query already guarantees.
      comment: (r.comment ?? "").trim(),
      authorName: r.displayName?.trim() || r.firstName?.trim() || null,
      createdAt: r.createdAt.toISOString(),
      providerName: r.providerName,
      providerSlug: r.providerSlug,
    }));
  }

  /**
   * Every review, for the screen that curates them.
   *
   * Both statuses, unlike every other read here: an administrator deciding
   * what the home page says needs to see a hidden review that is still
   * featured, which is precisely the state the public query silently drops.
   *
   * `featuredCount` is counted over the whole table rather than the page,
   * because it is the number beside "N of 4" — a count of the current page
   * would say 1 on page two of a list with four featured on page one.
   */
  async listForAdmin(input: {
    limit: number;
    offset: number;
    featuredOnly?: boolean;
    search?: string;
  }): Promise<{ items: AdminReviewRow[]; total: number; featuredCount: number }> {
    const db = getDb();

    // The three things an administrator would type to find a review: the
    // business it is about, the person who left it, and something they
    // remember it saying. `%` on both sides because none of the three is a
    // prefix somebody would know — this list is browsed, not looked up by key.
    // The term is length-bounded at the edge before it reaches the pattern.
    const term = input.search?.trim();
    const matches = term
      ? or(
          ilike(provider.name, `%${term}%`),
          ilike(profile.displayName, `%${term}%`),
          ilike(profile.firstName, `%${term}%`),
          ilike(review.comment, `%${term}%`),
        )
      : undefined;
    const filter = and(
      input.featuredOnly ? isNotNull(review.featuredAt) : undefined,
      matches,
    );

    const [rows, [totals], [featured]] = await Promise.all([
      db
        .select({
          id: review.id,
          providerId: review.providerId,
          providerName: provider.name,
          providerSlug: provider.slug,
          rating: review.rating,
          comment: review.comment,
          status: review.status,
          featuredAt: review.featuredAt,
          createdAt: review.createdAt,
          displayName: profile.displayName,
          firstName: profile.firstName,
        })
        .from(review)
        .innerJoin(provider, eq(provider.id, review.providerId))
        .leftJoin(profile, eq(profile.userId, review.authorUserId))
        .where(filter)
        // Featured first, so what the home page is currently saying is the
        // first thing this screen shows; newest among the rest.
        //
        // `NULLS LAST` spelled out, because Postgres does the opposite by
        // default: under a plain `DESC` a null sorts *before* every value, so
        // `desc(featuredAt)` put every unfeatured review above the featured
        // ones — exactly backwards, and silently, since the page still filled
        // with rows. Matches the partial index's own `DESC NULLS LAST`.
        .orderBy(sql`${review.featuredAt} desc nulls last`, desc(review.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      // The same joins as the page above: the filter can now name a column on
      // either joined table, and a bare `from(review)` would fail to resolve
      // it. `featuredCount` keeps its own unfiltered count — it is the "N of
      // 4" beside the toggles, which must not move when somebody searches.
      db
        .select({ n: count() })
        .from(review)
        .innerJoin(provider, eq(provider.id, review.providerId))
        .leftJoin(profile, eq(profile.userId, review.authorUserId))
        .where(filter),
      db.select({ n: count() }).from(review).where(isNotNull(review.featuredAt)),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        providerId: r.providerId,
        providerName: r.providerName,
        providerSlug: r.providerSlug,
        rating: r.rating,
        comment: r.comment,
        authorName: r.displayName?.trim() || r.firstName?.trim() || null,
        status: r.status as AdminReviewRow["status"],
        featuredAt: r.featuredAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total: totals?.n ?? 0,
      featuredCount: featured?.n ?? 0,
    };
  }

  /**
   * Marks a review as shown on the home page, or clears the mark.
   *
   * `new Date()` on every feature, including one that was already featured:
   * re-featuring is how an administrator moves a review to the front of the
   * rail, so the write must move the timestamp rather than no-op.
   *
   * `updatedAt` is deliberately *not* touched. It is the date the customer's
   * verdict last changed, and a provider's page reads it; an administrator's
   * curation is not an edit to what somebody said.
   */
  async setFeatured(reviewId: string, featured: boolean): Promise<boolean> {
    const rows = await getDb()
      .update(review)
      .set({ featuredAt: featured ? new Date() : null })
      .where(eq(review.id, reviewId))
      .returning({ id: review.id });

    return rows.length > 0;
  }

  /**
   * Average, count and the five-bar breakdown, in one round trip.
   *
   * The histogram is built with conditional sums rather than a `GROUP BY` so
   * the result is one row with a known shape: a group-by returns only the
   * scores somebody actually gave, and every caller would then have to fill in
   * the missing bars itself.
   *
   * `avg` comes back as a string from postgres (numeric has no lossless JS
   * type), so it is parsed here rather than left for a caller to discover.
   */
  async summary(providerId: string): Promise<ReviewSummary> {
    const bar = (score: number) => sql<number>`count(*) filter (where ${review.rating} = ${score})`;

    const [row] = await getDb()
      .select({
        count: sql<number>`count(*)`,
        average: sql<string | null>`avg(${review.rating})`,
        one: bar(1),
        two: bar(2),
        three: bar(3),
        four: bar(4),
        five: bar(5),
      })
      .from(review)
      .where(and(eq(review.providerId, providerId), eq(review.status, "published")));

    const count = Number(row?.count ?? 0);
    if (count === 0) return { average: null, count: 0, histogram: EMPTY_HISTOGRAM };

    return {
      // Rounded to one decimal at the edge, because that is the only precision
      // anything displays and shipping 4.833333 invites two clients to round it
      // differently.
      average: Math.round(Number(row!.average) * 10) / 10,
      count,
      histogram: {
        one: Number(row!.one),
        two: Number(row!.two),
        three: Number(row!.three),
        four: Number(row!.four),
        five: Number(row!.five),
      },
    };
  }

  /**
   * `status = 'active'` is part of the lookup, not a filter after it — the same
   * rule the public provider repository follows, so a business that is not
   * trading cannot be reviewed by anyone who happens to hold its id.
   *
   * Selects `name` alongside the existence check rather than making
   * `SubmitReviewCommand` run a second query for it: this row is already
   * loaded, and the name only needs to travel with the same read that already
   * decides whether the request may proceed at all.
   */
  async isReviewableProvider(providerId: string): Promise<{ name: string } | null> {
    const [row] = await getDb()
      .select({ name: provider.name })
      .from(provider)
      .where(and(eq(provider.id, providerId), eq(provider.status, "active")))
      .limit(1);
    return row ? { name: row.name } : null;
  }

  async worksAtProvider(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }
}
