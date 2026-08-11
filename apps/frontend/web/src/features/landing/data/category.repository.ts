import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { CategoryPageDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

const ALL = `
  query CategoryAll($input: CategoryAllInput!) {
    categoryAll(input: $input) {
      items { id code name description imageUrl icon }
      nextOffset
    }
  }`;

/**
 * How many arrive per request on the page that lists them all.
 *
 * Enough to fill a wide screen twice over, so the next page is usually already
 * in flight before the reader reaches the bottom — and small enough that the
 * first paint does not wait on a table that is meant to grow.
 */
export const CATEGORY_PAGE_SIZE = 24;

function fetchPage(locale: string, limit: number, offset: number) {
  return publicGraphql<{ categoryAll: CategoryPageDTO }>(ALL, {
    input: { locale, limit, offset },
  }).then((d) => d.categoryAll);
}

export const categoryQueries = {
  /**
   * The handful the home page shows.
   *
   * A plain query rather than the first page of the infinite one: the two want
   * different sizes, and sharing a cache entry would make the landing render
   * whatever the full page had last scrolled to.
   */
  preview: (locale: string, limit: number) =>
    queryOptions({
      // The locale is in the key: switching language has to fetch the other
      // set rather than reuse names in the language just left.
      queryKey: ["categories", "preview", locale, limit],
      queryFn: () => fetchPage(locale, limit, 0),
    }),

  /** Every category, a page at a time, for the page that lists them all. */
  all: (locale: string) =>
    infiniteQueryOptions({
      queryKey: ["categories", "all", locale],
      queryFn: ({ pageParam }) => fetchPage(locale, CATEGORY_PAGE_SIZE, pageParam),
      initialPageParam: 0,
      // Null ends it. Returning `undefined` is what `hasNextPage` reads as
      // "no more", and returning the same offset again would loop forever.
      getNextPageParam: (last) => last.nextOffset ?? undefined,
    }),
};
