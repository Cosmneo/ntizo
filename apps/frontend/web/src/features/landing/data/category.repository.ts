import { queryOptions } from "@tanstack/react-query";
import type { CategoryDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

const ALL = `
  query CategoryAll($input: CategoryAllInput!) {
    categoryAll(input: $input) { id code name description imageUrl icon }
  }`;

export const categoryQueries = {
  all: (locale: string) =>
    queryOptions({
      // The locale is part of the key: switching language has to fetch the
      // other set rather than reuse names in the language just left.
      queryKey: ["categories", locale],
      queryFn: async (): Promise<CategoryDTO[]> => {
        const d = await publicGraphql<{ categoryAll: CategoryDTO[] }>(ALL, {
          input: { locale },
        });
        return d.categoryAll;
      },
    }),
};
