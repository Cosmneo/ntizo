import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCategoryQueries,
  reorderCategories,
  saveCategory,
  type SaveCategoryInput,
} from "../data/admin-category.repository";
import type { AdminCategory } from "../domain/types";

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

/**
 * Writes a new display order.
 *
 * Optimistic, and it has to be: the whole point of dragging is that the row
 * lands where it was dropped. Waiting for the server would leave it snapping
 * back to where it started for the length of a round trip, which reads as the
 * drag having failed.
 *
 * The previous order is captured so a failure puts the list back exactly as it
 * was rather than leaving the browser showing an order the server rejected.
 */
export function useReorderCategories(queryKey: readonly unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderCategories(orderedIds),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<AdminCategory[]>(queryKey);
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        qc.setQueryData<AdminCategory[]>(
          queryKey,
          orderedIds.flatMap((id) => {
            const found = byId.get(id);
            // Positions are rewritten too, not just the array order: the row
            // shows its own number, and leaving the old one there would have
            // the list in one order and the numbers in another.
            return found ? [found] : [];
          }).map((c, i) => ({ ...c, sortOrder: i })),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
    },
    // Settled, not success: a failed reorder still needs the server's truth
    // back, and the rollback above is only a guess at it.
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });
}
