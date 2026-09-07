/** Who did a thing, as the platform's feed names them. */
export interface ActorSummary {
  /** The profile's display name, else first and last name — `""` when neither is filled in. */
  name: string;
  /** Null when the account is gone. */
  email: string | null;
}

/**
 * A batch of actors' names and emails, for a page of everybody's activity.
 *
 * The read tier's own port, on the pattern of `read/communication`'s
 * `CustomerNameReaderPort`: a display name is a read concern, so this reads
 * User's data without reaching into the Activity context's own ports. The
 * email is here too, because an audit trail names people by something that
 * does not change when they edit their profile.
 *
 * Batched, never once per row — one query for the whole page.
 */
export interface ActorReaderPort {
  /** User id → name and email. A user absent from the map does not exist any more. */
  findActorsByIds(userIds: string[]): Promise<Map<string, ActorSummary>>;
}
