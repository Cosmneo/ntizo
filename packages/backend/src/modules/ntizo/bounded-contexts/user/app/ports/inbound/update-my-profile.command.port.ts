import type { Locale, Gender } from "@ntizo/shared";
import type { ExecutionContext } from "../../../../../shared/infrastructure/execution-context";

/**
 * Every field is optional and `undefined` means "leave alone" — the aggregate's
 * update methods are written that way, so a partial update never has to read
 * and re-send the fields it is not changing.
 *
 * `phoneNumber`, `bio` and `avatarKey` accept `null` distinctly from
 * `undefined`: null clears the value, undefined leaves it. Collapsing the two
 * would make it impossible to remove a phone number once set.
 */
export interface UpdateMyProfileInput {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phoneNumber?: string | null;
  bio?: string | null;
  /**
   * The R2 key of an uploaded photo, or null to remove it and fall back to
   * whatever the sign-up provider supplied.
   *
   * There is deliberately no `avatarUrl` here. It used to accept any URL that
   * parsed, which let any account point its face at any image anywhere —
   * somebody else's bandwidth, or a tracking pixel served to every viewer.
   * `avatar_url` now has exactly one writer: the sign-up hook.
   */
  avatarKey?: string | null;
  language?: Locale;
  timezone?: string;
  /** ISO `YYYY-MM-DD`, or null to clear. Converted to a Date in the command. */
  dateOfBirth?: string | null;
  gender?: Gender | null;
}

export interface UpdateMyProfilePort {
  execute(ctx: ExecutionContext, input: UpdateMyProfileInput): Promise<void>;
}
