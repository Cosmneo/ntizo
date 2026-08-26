import type { Activity } from "../../../domain/aggregates/activity.aggregate";

/** One page of somebody's history, newest first. */
export interface ActivityPage {
  items: Activity[];
  /** Pass back as `cursor` to get the next page. Null when there is no more. */
  nextCursor: string | null;
}

export interface ActivityRepositoryPort {
  save(entity: Activity): Promise<string>;

  /**
   * Cursor-paged, not offset-paged.
   *
   * This table is appended to at the top, which is exactly where offset
   * breaks: a row written between two page fetches shifts every offset by one,
   * so the reader sees an entry twice or never. The notification inbox uses
   * offset and gets away with it because its list is read in one sitting.
   */
  listForActor(params: {
    actorUserId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<ActivityPage>;
}
