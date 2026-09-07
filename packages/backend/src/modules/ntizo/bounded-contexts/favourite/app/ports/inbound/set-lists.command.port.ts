import type { FavouriteTarget } from "../../../domain/favourite-target";

export interface SetListsInput {
  /** From the session, never from the request. See the command's class doc comment. */
  requesterUserId: string;
  targetType: FavouriteTarget;
  targetId: string;
  /**
   * Exactly which of this person's lists the listing should end up in.
   * Every id here must come back from {@link FavouriteListRepositoryPort.ownedBy}
   * for `requesterUserId` — anything else is `ListNotYoursError`, thrown
   * before any write. Empty is a real request: it means "in none of my
   * lists", which is how a favourite gets unsaved.
   */
  listIds: string[];
}

export interface SetListsOutput {
  /** Every list the listing is now in, read back after the write. */
  listIds: string[];
}

export interface SetListsPort {
  execute(input: SetListsInput): Promise<SetListsOutput>;
}
