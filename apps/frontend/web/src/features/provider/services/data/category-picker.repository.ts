import { queryOptions } from "@tanstack/react-query";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

const ALL = `
  query CategoryAllForServiceForm($input: CategoryAllInput!) {
    categoryAll(input: $input) {
      items { id code name }
      nextOffset
    }
  }`;

export interface CategoryPickerOption {
  id: string;
  code: string;
  name: string;
}

interface CategoryAllPage {
  items: CategoryPickerOption[];
  nextOffset: number | null;
}

/** The server's own per-request ceiling (`MAX_CATEGORY_PAGE` in the projection). */
const PAGE_SIZE = 48;

/**
 * A safety bound on how many pages this will follow, not a business limit.
 * `categoryAll` is paginated (`offset` in, `nextOffset` out, same as the
 * landing page's category grid), so the picker below already follows every
 * page the server reports — this only guards against looping forever if
 * `nextOffset` were ever wrong, not against a legitimately large catalogue.
 * 40 pages is 1 920 categories, further than any curated catalogue is
 * plausibly going to grow.
 */
const MAX_PAGES = 40;

/**
 * There is no session-authed "list categories, any provider" query —
 * `category.allForAdmin` is guarded to administrators, and a provider is not
 * necessarily one — so the picker reads the same anonymous, paginated query
 * the landing page's category grid does, and follows every page itself
 * rather than showing only the first: a `Select`'s own client-side search
 * can only filter what it was actually given, and a category past a
 * silently-dropped first page would be one nobody could ever pick.
 */
export const categoryPickerQueries = {
  all: (locale: string) =>
    queryOptions({
      queryKey: ["provider", "services", "categories", locale],
      queryFn: async (): Promise<CategoryPickerOption[]> => {
        const items: CategoryPickerOption[] = [];
        let offset = 0;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const d = await publicGraphql<{ categoryAll: CategoryAllPage }>(ALL, {
            input: { locale, limit: PAGE_SIZE, offset },
          });
          items.push(...d.categoryAll.items);
          if (d.categoryAll.nextOffset === null) break;
          offset = d.categoryAll.nextOffset;
        }
        return items;
      },
    }),
};
