import {
  CategoryNotFoundError,
  CategoryOrderInvalidError,
} from "../../domain/exceptions";
import type { CategoryRepositoryPort } from "../ports/outbound/category.repository.port";

export interface ReorderCategoriesCommandInput {
  /** Every category, in the order they should appear. */
  orderedIds: readonly string[];
}

/**
 * Writes a new display order.
 *
 * Takes the complete list rather than "move this one to position 3": moving a
 * category between two others shifts everything after it, so a single
 * position is only ever half an instruction — and two administrators sending
 * half-instructions at once produce an order neither of them asked for.
 *
 * Duplicates are refused rather than deduplicated. A list with the same id
 * twice is a client that has lost track of its own rows, and quietly fixing it
 * would write an order that is missing something.
 */
export class ReorderCategoriesCommand {
  constructor(private readonly repo: CategoryRepositoryPort) {}

  async execute(input: ReorderCategoriesCommandInput): Promise<{ ok: true }> {
    const ids = input.orderedIds;
    if (new Set(ids).size !== ids.length) {
      // A kit error type, not a bare `Error`. A bare throw reaches the browser
      // as "An unexpected error occurred", which tells the person dragging a
      // row that the server broke when what happened is that their list and
      // the server's had drifted apart.
      throw new CategoryOrderInvalidError("the same category appears twice");
    }
    // Checked before writing any of them: a partial reorder leaves the list in
    // a state nobody asked for and no screen explains.
    for (const id of ids) {
      if (!(await this.repo.exists(id))) throw new CategoryNotFoundError(id);
    }
    if (ids.length > 0) await this.repo.reorder(ids);
    return { ok: true };
  }
}
