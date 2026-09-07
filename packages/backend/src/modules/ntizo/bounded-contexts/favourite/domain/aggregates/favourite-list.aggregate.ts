/** The column width `favourite_list.name` is declared with. */
export const LIST_NAME_MAX = 60;

export interface FavouriteListProps {
  id?: string;
  userId: string;
  name: string | null;
  isDefault: boolean;
  createdAt: Date;
}

/**
 * A named collection of saved listings.
 *
 * `name` is nullable, and that nullability is the whole mechanism: the
 * default list every person starts with has no stored name at all, so it is
 * rendered from a translated key and reads *Favoritos* to one person and
 * *Favourites* to another. Renaming it writes a name and it stops being
 * translated — a list somebody named is theirs, not the platform's. See
 * `favourite_list.schema.ts` for the same reasoning against the column.
 */
export class FavouriteList {
  private constructor(private readonly props: FavouriteListProps) {}

  private static assertName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("[favourite] a list name cannot be blank");
    }
    if (trimmed.length > LIST_NAME_MAX) {
      throw new Error(`[favourite] a list name cannot be longer than ${LIST_NAME_MAX} characters`);
    }
    return trimmed;
  }

  /**
   * The list every person is given to begin with. Nameless on purpose — see
   * the class doc comment.
   */
  static createDefault(params: { id?: string; userId: string; createdAt: Date }): FavouriteList {
    return new FavouriteList({
      id: params.id,
      userId: params.userId,
      name: null,
      isDefault: true,
      createdAt: params.createdAt,
    });
  }

  /**
   * A list somebody named. Used both for a fresh, additional list and for
   * turning the default list into a named one through {@link rename}.
   *
   * Validates: a blank name, or one past the `varchar(60)` the column is
   * declared with, throws here rather than reaching the database as a
   * silent truncation or a constraint failure the person reads as "saving is
   * broken".
   */
  static create(params: { id?: string; userId: string; name: string; createdAt: Date }): FavouriteList {
    return new FavouriteList({
      id: params.id,
      userId: params.userId,
      name: FavouriteList.assertName(params.name),
      isDefault: false,
      createdAt: params.createdAt,
    });
  }

  /**
   * The way out. Used only by the repository, to turn a stored row back into
   * a `FavouriteList`.
   *
   * Skips the checks `create` performs, on purpose: validation belongs on the
   * way in, and a row reaching this method already passed it once, when it
   * was first written. Routing a read through `create` instead would mean a
   * rule tightened later (say, `LIST_NAME_MAX` shrinking) throws on *read*
   * rather than on write — and because the repository maps a whole page of
   * rows in one pass, one such row would fail the entire page instead of only
   * itself. The same split `Activity.rehydrate` makes.
   */
  static rehydrate(props: FavouriteListProps): FavouriteList {
    return new FavouriteList(props);
  }

  /**
   * Gives the list a name, or a new one. Returns a new instance rather than
   * mutating — nothing else in this codebase mutates an aggregate in place.
   *
   * Applies to the default list too, and deliberately does not clear
   * `isDefault`: renaming is allowed on the default list, but the list stays
   * the one a person's hearts land in by default until they explicitly
   * choose another. Whether the default list may be *removed* is a different
   * question this method does not answer — see `DefaultListNotRemovableError`.
   */
  rename(name: string): FavouriteList {
    return new FavouriteList({ ...this.props, name: FavouriteList.assertName(name) });
  }

  get id() {
    return this.props.id;
  }
  get userId() {
    return this.props.userId;
  }
  get name() {
    return this.props.name;
  }
  get isDefault() {
    return this.props.isDefault;
  }
  get createdAt() {
    return this.props.createdAt;
  }
}
