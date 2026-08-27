import { isActivityType, type ActivityType } from "../activity-type";

export interface ActivityProps {
  id?: string;
  actorUserId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

/**
 * One recorded action.
 *
 * Thin on purpose: there is nothing to transition. An activity row is written
 * once and never changes — no read state, no status, no correction. That is
 * what separates it from `NotificationDelivery`, which exists precisely to
 * carry a status through time.
 */
export class Activity {
  private constructor(private readonly props: ActivityProps) {}

  /**
   * The way in. Used by the command that turns a domain event into a row.
   *
   * Validates: an unknown type or a blank actor throws here, before anything
   * is written, so a bad row never reaches the table in the first place.
   */
  static record(params: ActivityProps): Activity {
    if (!isActivityType(params.type)) {
      throw new Error(`[activity] unknown activity type: ${String(params.type)}`);
    }
    if (!params.actorUserId.trim()) {
      throw new Error("[activity] an activity row needs an actor");
    }
    // `ActivityProps.payload` is typed `Record<string, unknown>`, but the
    // type-only guarantee ends the moment a caller passes an event payload
    // through with a cast (every write-side handler does exactly this) —
    // nothing stops an array or a bare scalar landing in the jsonb column,
    // which the DB accepts without complaint. Caught here, on the way in,
    // rather than left for the read side to discover: `payload` reaching the
    // GraphQL output schema as anything but a record fails that field's
    // output validation for the WHOLE page, not just the one row — a single
    // bad write turning into every reader of that page seeing a masked
    // INTERNAL_ERROR forever. The read model still degrades a row it
    // encounters despite this check (a row written before this validation
    // existed, or inserted by hand) — see `activityEntryReadModel`.
    if (typeof params.payload !== "object" || params.payload === null || Array.isArray(params.payload)) {
      throw new Error("[activity] payload must be a plain object");
    }
    return new Activity(params);
  }

  /**
   * The way out. Used only by the repository, to turn a stored row back into
   * an `Activity`.
   *
   * Skips the checks `record` performs, on purpose: validation belongs on the
   * way in, and a row reaching this method already passed it once, when
   * `record` first wrote it. Routing a read through `record` instead would
   * mean a type later dropped from `ACTIVITY_TYPES` throws on *read* rather
   * than on write — and because the repository maps a whole page of rows in
   * one pass, one unrenderable row would fail the entire page instead of only
   * itself. Matches the split `NotificationDelivery.rehydrate` makes for the
   * same reason.
   */
  static rehydrate(props: ActivityProps): Activity {
    return new Activity(props);
  }

  get id() {
    return this.props.id;
  }
  get actorUserId() {
    return this.props.actorUserId;
  }
  get type() {
    return this.props.type;
  }
  get payload() {
    return this.props.payload;
  }
  get occurredAt() {
    return this.props.occurredAt;
  }
}
