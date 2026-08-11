import { queryOptions } from "@tanstack/react-query";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

const ALL = `
  query CategoryAllForServiceForm($input: CategoryAllInput!) {
    categoryAll(input: $input) {
      items { id code name }
    }
  }`;

export interface CategoryPickerOption {
  id: string;
  code: string;
  name: string;
}

/**
 * The public tier's ceiling on one page (`MAX_CATEGORY_PAGE` in the
 * projection). There is no session-authed "list categories, any provider"
 * query — `category.allForAdmin` is guarded to administrators, and a
 * provider is not necessarily one — so the picker reads the same anonymous
 * query the landing page's category grid does. A catalogue past 48 entries
 * would need a searchable, paginated picker; the MVP's curated set does not
 * reach that yet.
 */
const CATEGORY_PICKER_LIMIT = 48;

export const categoryPickerQueries = {
  all: (locale: string) =>
    queryOptions({
      queryKey: ["provider", "services", "categories", locale],
      queryFn: async (): Promise<CategoryPickerOption[]> => {
        const d = await publicGraphql<{ categoryAll: { items: CategoryPickerOption[] } }>(ALL, {
          input: { locale, limit: CATEGORY_PICKER_LIMIT },
        });
        return d.categoryAll.items;
      },
    }),
};
