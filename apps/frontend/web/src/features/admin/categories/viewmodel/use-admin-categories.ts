import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCategoryQueries,
  saveCategory,
  type SaveCategoryInput,
} from "../data/admin-category.repository";

export function useAdminCategories(input: { search?: string }) {
  return useQuery(adminCategoryQueries.all(input));
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCategoryInput) => saveCategory(input),
    // Every category list, not just the one currently filtered: a rename has
    // to show up whatever search the person goes back to.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });
}
