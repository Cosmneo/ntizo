import { UnknownFavouriteTargetError } from "../exceptions";
import { isFavouriteTarget, type FavouriteTarget } from "../favourite-target";

export interface FavouriteProps {
  id?: string;
  listId: string;
  userId: string;
  targetType: FavouriteTarget;
  targetId: string;
  createdAt: Date;
}

/**
 * One listing filed into one list.
 *
 * Thin on purpose, the same way `Activity` is: there is nothing to
 * transition. A favourite is either in a list or it is not — removing one is
 * deleting the row, not editing this aggregate into a different state. See
 * `favourite.schema.ts` for why it carries no foreign key to the listing it
 * points at.
 */
export class Favourite {
  private constructor(private readonly props: FavouriteProps) {}

  /**
   * The way in. Used by the command that saves a listing to a list.
   *
   * Validates: an unknown `targetType`, or a blank owner, list or target id,
   * throws here, before anything is written, so a bad row never reaches the
   * table in the first place.
   */
  static file(params: FavouriteProps): Favourite {
    if (!isFavouriteTarget(params.targetType)) {
      throw new UnknownFavouriteTargetError(params.targetType);
    }
    if (!params.userId.trim()) {
      throw new Error("[favourite] a favourite needs an owner");
    }
    if (!params.listId.trim()) {
      throw new Error("[favourite] a favourite needs a list");
    }
    if (!params.targetId.trim()) {
      throw new Error("[favourite] a favourite needs a target");
    }
    return new Favourite(params);
  }

  /**
   * The way out. Used only by the repository, to turn a stored row back into
   * a `Favourite`.
   *
   * Skips the checks `file` performs, on purpose: validation belongs on the
   * way in, and a row reaching this method already passed it once, when
   * `file` first wrote it. Routing a read through `file` instead would mean a
   * target type later dropped from `FAVOURITE_TARGETS` throws on *read*
   * rather than on write — and because the repository maps a whole page of
   * rows in one pass, one unrenderable row would fail the entire page instead
   * of only itself. The same split `Activity.rehydrate` makes.
   */
  static rehydrate(props: FavouriteProps): Favourite {
    return new Favourite(props);
  }

  get id() {
    return this.props.id;
  }
  get listId() {
    return this.props.listId;
  }
  get userId() {
    return this.props.userId;
  }
  get targetType() {
    return this.props.targetType;
  }
  get targetId() {
    return this.props.targetId;
  }
  get createdAt() {
    return this.props.createdAt;
  }
}
