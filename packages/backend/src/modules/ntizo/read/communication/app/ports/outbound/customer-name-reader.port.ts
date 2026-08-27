/**
 * A batch of customers' current display names, as a provider's inbox row
 * needs one to label itself.
 *
 * The read tier's own port, same shape and same reasoning as
 * `ProviderNameReaderPort` (Task 7) — a display name is a read concern, not
 * a write-path authorization one, so this does not extend anything the
 * write tier already owns, and it does not reach into the Communication
 * bounded context's own ports either: this reads User's data, the same way
 * `ProviderNameReaderPort` reads Provider's.
 *
 * Batched, not a `findNameById` called once per row — same "one query for
 * the whole page, not one per row" requirement `ProviderNameReaderPort` and
 * `MessageRepositoryPort.countUnreadForViewer` both already document.
 *
 * The name itself follows the same formula the account read side already
 * settled on (`DrizzleUserReadRepository.findCurrentUser`): a profile's own
 * `displayName` when set, else `"${firstName} ${lastName}".trim()`. Not
 * called directly — that method reads one user for their own account page,
 * this reads a batch for somebody else's inbox — but the formula is copied
 * rather than re-derived, so a customer's name reads the same way here as
 * it does on their own account.
 */
export interface CustomerNameReaderPort {
  /** Customer user id → display name. A user absent from the map has no profile row yet, or does not exist. */
  findNamesByIds(customerUserIds: string[]): Promise<Map<string, string>>;
}
