import type { FavouriteTarget } from "../../../domain/favourite-target";

export interface QuickSaveInput {
  /** From the session, never from the request. See the command's class doc comment. */
  requesterUserId: string;
  targetType: FavouriteTarget;
  targetId: string;
}

export interface QuickSaveOutput {
  /** Every list the listing is now in, default included. The dialog's tick marks. */
  listIds: string[];
}

export interface QuickSavePort {
  execute(input: QuickSaveInput): Promise<QuickSaveOutput>;
}
