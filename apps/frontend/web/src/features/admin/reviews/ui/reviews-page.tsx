import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquareQuote, Star } from "lucide-react";
import type { ReviewAdminDTO } from "@ntizo/shared/read-models";
import { Badge, Button } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import {
  ADMIN_REVIEW_PAGE_SIZE,
} from "../data/admin-review.repository";
import { useAdminReviews, useSetReviewFeatured } from "../viewmodel/use-admin-reviews";

/**
 * How many the home page draws. Mirrors `MAX_FEATURED` on the server, which is
 * the one that actually enforces it — this copy exists so the screen can say
 * "2 of 4" before a fifth attempt is refused, not instead of the refusal.
 */
const MAX_FEATURED = 4;

/**
 * Every review, and which of them the home page shows.
 *
 * The home page's testimonials used to be four invented quotes with invented
 * names in a file called `mock-content.ts`. They are now whichever real
 * reviews an administrator picks here — which is why this screen exists at
 * all, and why it lists hidden reviews too: a hidden review that is still
 * marked featured is a state worth being able to see.
 */
export function AdminReviewsPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const query = useAdminReviews({
    offset,
    ...(featuredOnly ? { featuredOnly: true } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const setFeatured = useSetReviewFeatured();

  usePageHeader(t("reviewsTitle"), t("reviewsSubtitle"));

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const featuredCount = query.data?.featuredCount ?? 0;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {query.error && (
        <p className="type-body text-[var(--color-destructive)]">{t("reviewsError")}</p>
      )}
      {/* The refusal from the server, said where the toggle that caused it is.
          The cap is checked there, not here — this only reports it. */}
      {setFeatured.error && (
        <p className="type-body text-[var(--color-destructive)]">
          {t("reviewsFeatureFailed", { max: MAX_FEATURED })}
        </p>
      )}

      {/* The count and the filter above the table rather than inside it: this
          is the number the whole screen is about, and burying it in a column
          header would make the one bounded thing here look incidental. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body">
          {t("reviewsFeaturedCount", { count: featuredCount, max: MAX_FEATURED })}
        </p>
        <Button
          variant={featuredOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFeaturedOnly((v) => !v);
            // Back to the first page: page three of the unfiltered list is
            // past the end of a four-row one, which renders as empty and
            // reads as the filter having found nothing.
            setOffset(0);
          }}
        >
          <Star className="h-4 w-4" aria-hidden="true" />
          {t("reviewsOnHomeFilter")}
        </Button>
      </div>

      <CollectionCard
        title={t("reviewsTitle")}
        shown={rows.length}
        total={total}
        loading={query.isLoading}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          // Back to the first page. Page three of the unfiltered list is past
          // the end of a two-row result, which renders as empty and reads as
          // the search having found nothing.
          setOffset(0);
        }}
        searchPlaceholder={t("reviewsSearchPlaceholder")}
        columns={[
          { key: "review", label: t("reviewsReview"), className: "pl-5" },
          { key: "business", label: t("reviewsBusiness"), skeletonWidth: "w-32" },
          {
            key: "rating",
            label: t("reviewsRating"),
            align: "right",
            skeletonWidth: "w-12",
          },
          {
            key: "status",
            label: t("reviewsStatus"),
            skeletonWidth: "w-20",
            skeletonShape: "badge",
          },
          {
            key: "date",
            label: t("reviewsDate"),
            align: "right",
            skeletonWidth: "w-24",
          },
          // Declared, and it has to be: `CollectionCard` renders `row.actions`
          // into the column whose key is literally "actions", so a row that
          // supplies one without this column supplies it to nowhere — which
          // is a table of reviews with no way to feature any of them.
          {
            key: "actions",
            label: t("reviewsAction"),
            align: "right",
            className: "pr-5",
            skeletonWidth: "w-28",
          },
        ]}
        emptyText={t("reviewsEmpty")}
        emptyTitle={t("reviewsEmptyTitle")}
        emptyBadge={MessageSquareQuote}
        noMatchesText={t("reviewsNoMatches")}
        noMatchesTitle={t("reviewsNoMatchesTitle")}
        filtered={featuredOnly || search.trim() !== ""}
        rows={rows.map((review) => ({
          key: review.id,
          primary: <ReviewQuote review={review} />,
          cells: {
            business: (
              <span className="block max-w-[22ch] truncate">{review.providerName}</span>
            ),
            rating: (
              <span className="flex items-center justify-end gap-1 tabular-nums">
                <Star
                  className="h-3.5 w-3.5 fill-[#f5a524] text-[#f5a524]"
                  aria-hidden="true"
                />
                {review.rating}
              </span>
            ),
            status: (
              <Badge tone={review.status === "published" ? "success" : "warning"}>
                {t(`reviewStatus.${review.status}`, { defaultValue: review.status })}
              </Badge>
            ),
            date: (
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {dateFormat.format(new Date(review.createdAt))}
              </span>
            ),
          },
          actions: <FeatureToggle review={review} />,
        }))}
      />

      {/* Plain previous/next rather than numbered pages: the backend answers
          with a total and an offset, and nothing here needs to jump to page
          seven of a list somebody is skimming. */}
      {total > ADMIN_REVIEW_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - ADMIN_REVIEW_PAGE_SIZE))}
          >
            {t("reviewsPrevious")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + ADMIN_REVIEW_PAGE_SIZE >= total}
            onClick={() => setOffset((o) => o + ADMIN_REVIEW_PAGE_SIZE)}
          >
            {t("reviewsNext")}
          </Button>
        </div>
      )}
    </div>
  );

  /**
   * The one control this screen exists for.
   *
   * Nested so it can reach `setFeatured` and `featuredCount` without either
   * being threaded through as props — the same reason `Person` is a sibling
   * in the users page but this is not: that one is presentational and this
   * one acts.
   */
  function FeatureToggle({ review }: { review: ReviewAdminDTO }) {
    const isFeatured = review.featuredAt !== null;
    // A review with no words has nothing to put on the card, and the public
    // query filters it out — so offering the toggle would be offering a
    // control whose effect is invisible.
    const hasWords = (review.comment ?? "").trim().length > 0;
    const full = !isFeatured && featuredCount >= MAX_FEATURED;

    return (
      <Button
        variant={isFeatured ? "default" : "outline"}
        size="sm"
        disabled={!hasWords || full || setFeatured.isPending}
        title={
          !hasWords
            ? t("reviewsCannotFeatureNoComment")
            : full
              ? t("reviewsFeatureFull", { max: MAX_FEATURED })
              : undefined
        }
        onClick={() =>
          setFeatured.mutate({ reviewId: review.id, featured: !isFeatured })
        }
      >
        <Star
          className={isFeatured ? "h-4 w-4 fill-current" : "h-4 w-4"}
          aria-hidden="true"
        />
        {isFeatured ? t("reviewsOnHome") : t("reviewsPutOnHome")}
      </Button>
    );
  }
}

/** What was said, and by whom — the thing an administrator is actually judging. */
function ReviewQuote({ review }: { review: ReviewAdminDTO }) {
  const { t } = useTranslation("admin");
  return (
    <div className="min-w-0">
      <p className="type-body-medium truncate font-semibold">
        {review.authorName ?? t("reviewsAnonymous")}
      </p>
      {/* Two lines, not one: a testimonial is being judged on its words, and a
          single truncated line is not enough to judge one by. */}
      <p className="type-caption line-clamp-2 text-[var(--color-muted-foreground)]">
        {review.comment?.trim() || t("reviewsNoComment")}
      </p>
    </div>
  );
}
