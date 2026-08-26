import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from "@cosmneo/onion-lasagna";

/**
 * User BC domain exceptions.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer surfaces a real code instead of masking it to INTERNAL_ERROR.
 * The `code` strings are a PUBLIC CONTRACT — the web client branches on them.
 * Renaming one is a breaking change to the frontend.
 */

export class ProfileNotFoundError extends NotFoundError {
  constructor(userId: string) {
    super({ message: `Profile not found for user: ${userId}`, code: "PROFILE_NOT_FOUND" });
    this.name = "ProfileNotFoundError";
  }
}

/**
 * Deliberately does not name the number it rejected.
 *
 * Error messages end up in logs, and a phone number is not a detail about a
 * request — it is the person making it. The caller supplied the value and
 * does not need it read back.
 */
export class InvalidPhoneNumberError extends UnprocessableError {
  constructor() {
    super({
      message: "Phone number must be in international format, for example +258841234567.",
      code: "INVALID_PHONE_NUMBER",
    });
    this.name = "InvalidPhoneNumberError";
  }
}

/**
 * One number, one account.
 *
 * Enforced by the unique index on `better_auth.user.phone_number`, which is
 * what an SMS is ultimately delivered against: two accounts sharing a number
 * means a code sent to one arriving for the other.
 */
export class PhoneNumberAlreadyInUseError extends ConflictError {
  constructor() {
    super({
      message: "That phone number is already in use by another account.",
      code: "PHONE_NUMBER_ALREADY_IN_USE",
    });
    this.name = "PhoneNumberAlreadyInUseError";
  }
}

/**
 * `avatarKey` names an object in the public media bucket, and the upload
 * route only ever writes under `avatar/<uploaderId>/...`. Accepting any other
 * key would let an account "adopt" a photo it never uploaded — including one
 * belonging to somebody else — by simply typing that person's id into the
 * mutation. This is what makes the inbound port's comment that "a key can
 * only name an object this platform stored" actually true, rather than a
 * claim nothing checks.
 */
export class AvatarKeyNotOwnedError extends ForbiddenError {
  constructor() {
    super({
      message: "That avatar key does not belong to this account.",
      code: "AVATAR_KEY_NOT_OWNED",
    });
    this.name = "AvatarKeyNotOwnedError";
  }
}
