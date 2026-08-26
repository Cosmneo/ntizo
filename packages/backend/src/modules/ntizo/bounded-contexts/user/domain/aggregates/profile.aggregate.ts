// Profile aggregate — extended personal data, one-to-one with User.

import { DEFAULT_LOCALE, isValidTimeZone, type Locale, type Gender } from "@ntizo/shared";
import { TimezoneInvalidError } from "../exceptions";

export interface ProfileProps {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  /**
   * The R2 key of a photo this person uploaded, or null.
   *
   * Separate from `avatarUrl` because the two have different shapes and
   * different owners: Google hands over an absolute URL on a host we do not
   * control, and an upload of ours produces a key whose URL is composed at
   * read time from the stage's own media base. Storing that composed URL
   * would put one stage's hostname into the database.
   *
   * The key wins when both are set, so a photo somebody chose is never
   * displaced by a later Google sign-in.
   */
  avatarKey: string | null;
  phoneNumber: string | null;
  bio: string | null;
  language: Locale;
  timezone: string;
  dateOfBirth: Date | null;
  gender: Gender | null;
  createdAt: Date;
  updatedAt: Date;
}

function computeDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export class Profile {
  private constructor(private readonly props: ProfileProps) {}

  static rehydrate(props: ProfileProps): Profile {
    return new Profile(props);
  }

  static create(params: {
    userId: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    language?: Locale;
    timezone?: string;
    /** Google's, at sign-up. Never one of ours — an upload cannot exist yet. */
    avatarUrl?: string | null;
  }): Profile {
    const now = new Date();
    const firstName = params.firstName ?? "";
    const lastName = params.lastName ?? "";
    const displayName =
      params.displayName !== undefined
        ? params.displayName
        : computeDisplayName(firstName, lastName);
    return new Profile({
      userId: params.userId,
      firstName,
      lastName,
      displayName: displayName === "" ? "" : displayName,
      avatarUrl: params.avatarUrl ?? null,
      avatarKey: null,
      phoneNumber: null,
      bio: null,
      // DEFAULT_LOCALE, not a literal. This read "en-US" while
      // packages/shared declared the platform default to be pt-MZ and said so
      // in a comment — two constants disagreeing about what language the
      // product speaks, with the aggregate quietly winning.
      language: params.language ?? DEFAULT_LOCALE,
      // Falls back to UTC rather than throwing on a bad value: at this
      // moment the timezone came off an `X-Timezone` header nobody typed —
      // sign-up is not the point to reject somebody over it. `updatePreferences`
      // below is where a person is actually asserting a choice, and that one
      // refuses instead of silently substituting a value they did not pick.
      timezone: params.timezone && isValidTimeZone(params.timezone) ? params.timezone : "UTC",
      dateOfBirth: null,
      gender: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  get userId() {
    return this.props.userId;
  }
  get firstName() {
    return this.props.firstName;
  }
  get lastName() {
    return this.props.lastName;
  }
  get displayName(): string {
    return (
      this.props.displayName ??
      computeDisplayName(this.props.firstName, this.props.lastName)
    );
  }
  get avatarUrl() {
    return this.props.avatarUrl;
  }
  get avatarKey() {
    return this.props.avatarKey;
  }
  get phoneNumber() {
    return this.props.phoneNumber;
  }
  get bio() {
    return this.props.bio;
  }
  get language() {
    return this.props.language;
  }
  get timezone() {
    return this.props.timezone;
  }
  get dateOfBirth() {
    return this.props.dateOfBirth;
  }
  get gender() {
    return this.props.gender;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  updateName(params: {
    firstName?: string;
    lastName?: string;
    displayName?: string;
  }): void {
    const nameChanged =
      params.firstName !== undefined || params.lastName !== undefined;
    if (params.firstName !== undefined) this.props.firstName = params.firstName;
    if (params.lastName !== undefined) this.props.lastName = params.lastName;
    if (params.displayName !== undefined) {
      this.props.displayName = params.displayName;
    } else if (nameChanged) {
      this.props.displayName = computeDisplayName(
        this.props.firstName,
        this.props.lastName,
      );
    }
    this.props.updatedAt = new Date();
  }

  updateContact(params: {
    phoneNumber?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    avatarKey?: string | null;
  }): void {
    if (params.phoneNumber !== undefined)
      this.props.phoneNumber = params.phoneNumber;
    if (params.bio !== undefined) this.props.bio = params.bio;
    if (params.avatarUrl !== undefined)
      this.props.avatarUrl = params.avatarUrl;
    if (params.avatarKey !== undefined)
      this.props.avatarKey = params.avatarKey;
    this.props.updatedAt = new Date();
  }

  updatePreferences(params: { language?: Locale; timezone?: string }): void {
    if (params.language !== undefined) this.props.language = params.language;
    if (params.timezone !== undefined) {
      // Checked here, not merely by the GraphQL schema's `.min(1)`: a
      // non-empty string that is not a real IANA zone would otherwise reach
      // `profile.timezone` and break every date this person's own app
      // renders, silently, at read time rather than at the moment they
      // picked it. Refused, unlike `create()` above, because this is the
      // person actually asserting a choice — there is no "we could not
      // tell" fallback to reach for.
      if (!isValidTimeZone(params.timezone)) {
        throw new TimezoneInvalidError(params.timezone);
      }
      this.props.timezone = params.timezone;
    }
    this.props.updatedAt = new Date();
  }

  /**
   * Date of birth and gender, kept apart from name and contact.
   *
   * Its own method because the two fields are optional personal details a user
   * may never fill in and may later clear — folding them into `updateContact`
   * would make "I changed my bio" and "I disclosed my gender" the same
   * operation, and make a null in one indistinguishable from a null in the
   * other at the call site.
   */
  updatePersonal(params: { dateOfBirth?: Date | null; gender?: Gender | null }): void {
    if (params.dateOfBirth !== undefined) this.props.dateOfBirth = params.dateOfBirth;
    if (params.gender !== undefined) this.props.gender = params.gender;
    this.props.updatedAt = new Date();
  }

  toJSON(): ProfileProps {
    return { ...this.props };
  }
}
