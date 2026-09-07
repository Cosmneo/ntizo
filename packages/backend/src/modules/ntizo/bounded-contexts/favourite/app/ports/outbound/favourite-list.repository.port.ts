import type { FavouriteList } from "../../../domain/aggregates/favourite-list.aggregate";

export interface FavouriteListRepositoryPort {
  /**
   * Creates the default list if this person has none, and returns it either
   * way. Idempotent under concurrency.
   *
   * The idempotence is not a nicety: the very first heart-tap of a session
   * can arrive from two tabs at once, and both would otherwise decide there
   * is no default and both create one. The adapter owes this an
   * `INSERT … ON CONFLICT DO NOTHING`, never a read followed by a decision.
   */
  ensureDefault(userId: string, now: Date): Promise<FavouriteList>;

  /**
   * Writes a new list and returns its id.
   *
   * Insert-only. Renaming goes through {@link rename}, which is scoped by
   * owner; there is nothing else on a list that can change.
   */
  save(entity: FavouriteList): Promise<string>;

  /**
   * Gives a list a new name.
   *
   * `userId` is part of the identity here, not just the id: the command has
   * already checked ownership, and this is the second lock on the same door —
   * an id that slipped through updates nothing rather than renaming a
   * stranger's list.
   */
  rename(p: { id: string; userId: string; name: string }): Promise<void>;

  /** Deletes the list and, by cascade, its entries. Returns false when the id is not this user's. */
  remove(p: { id: string; userId: string }): Promise<boolean>;

  listForUser(userId: string): Promise<FavouriteList[]>;

  /** Every id in `listIds` that belongs to this user. The authorisation check every command runs. */
  ownedBy(p: { userId: string; listIds: string[] }): Promise<string[]>;
}
