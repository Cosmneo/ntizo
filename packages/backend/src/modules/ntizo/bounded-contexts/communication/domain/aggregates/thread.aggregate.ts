import { THREAD_TYPES, type ThreadType } from "../../../../shared/infrastructure/database/communication/enums";
import { ThreadTypeInvalidError } from "../exceptions";

export interface ThreadProps {
  readonly id: string | null;
  readonly type: ThreadType;
  readonly customerUserId: string;
  readonly providerId: string;
  readonly lastMessageAt: Date;
  readonly createdAt: Date;
}

/**
 * One conversation between a customer and a provider.
 *
 * Same two-factory split as `Message`, for the same reason: `open` is the
 * write path and validates; `rehydrate` is the read path and trusts the row
 * that Task 1's `thread_customer_provider_uq` (partial, `type = 'inquiry'`)
 * already guaranteed was unique when it was written. Re-checking `type`
 * against `THREAD_TYPES` on every read would mean a future addition to that
 * list (phase 2's support threads) invalidates every row written before the
 * addition — see `Message`'s and `Activity.rehydrate`'s doc comments for the
 * general argument.
 *
 * `open` takes no `id`: unlike `Review.create`, which accepts one because
 * `Review.revise()` reuses it to rebuild an *existing* review around its
 * known id, `Thread` has no revise and no other reason to be constructed
 * around an id it did not just get from a fresh insert. A thread's id is
 * always `null` coming out of `open` — the repository assigns the real one,
 * via `INSERT … RETURNING id` against the table's `defaultRandom()` column
 * — and reconstructing a thread that already has one is `rehydrate`'s job,
 * not `open`'s.
 */
export class Thread {
  private constructor(readonly props: ThreadProps) {}

  /** The write path: validates that `type` is one Task 1's `THREAD_TYPES` lists. */
  static open(params: {
    type: ThreadType;
    customerUserId: string;
    providerId: string;
    lastMessageAt: Date;
  }): Thread {
    if (!(THREAD_TYPES as readonly string[]).includes(params.type)) {
      throw new ThreadTypeInvalidError(params.type);
    }

    return new Thread({
      id: null,
      type: params.type,
      customerUserId: params.customerUserId,
      providerId: params.providerId,
      lastMessageAt: params.lastMessageAt,
      // A thread's `createdAt` is the moment it was opened, which is the
      // moment of its first message — the same instant `lastMessageAt`
      // carries here. There is no separate "now" to open with; the two
      // timestamps genuinely coincide on this path.
      createdAt: params.lastMessageAt,
    });
  }

  /**
   * The read path: trusts the database, checks nothing.
   *
   * See `Message.rehydrate` and `Activity.rehydrate` for why this must not
   * be `open`'s body reused with validation skipped — the split has to be
   * two real methods, not one method plus a flag, or a rule tightened later
   * silently rejects rows this method exists to read back unchanged.
   */
  static rehydrate(props: ThreadProps): Thread {
    return new Thread(props);
  }

  get id(): string | null {
    return this.props.id;
  }
  get type(): ThreadType {
    return this.props.type;
  }
  get customerUserId(): string {
    return this.props.customerUserId;
  }
  get providerId(): string {
    return this.props.providerId;
  }
  get lastMessageAt(): Date {
    return this.props.lastMessageAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
