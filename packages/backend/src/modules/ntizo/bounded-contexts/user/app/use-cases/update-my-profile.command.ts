import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { AuthIdentityPort, ProfileRepositoryPort } from "../ports/outbound";
import type {
  UpdateMyProfileInput,
  UpdateMyProfilePort,
} from "../ports/inbound/update-my-profile.command.port";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../shared/infrastructure/execution-context";
import { AvatarKeyNotOwnedError, ProfileNotFoundError } from "../../domain/exceptions";
import { normalizePhoneNumber } from "../../domain/value-objects/phone-number";

/**
 * Updates the caller's own profile.
 *
 * The subject is always `requireAuthenticated(ctx).userId` — never anything the
 * caller supplies. There is deliberately no `userId` on the input: an
 * "update a profile" command that takes a target id is one authorization bug
 * away from letting anyone edit anyone, and this use case has no legitimate
 * caller that needs to edit someone else's. An admin-facing equivalent, if it
 * ever exists, should be its own command with its own authorization.
 *
 * The three aggregate methods each stamp `updatedAt`, so calling all three
 * would be harmless but wasteful; only the groups with a supplied field are
 * invoked.
 */
export class UpdateMyProfileCommand implements UpdateMyProfilePort {
  constructor(
    private readonly profileRepo: ProfileRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly authIdentity: AuthIdentityPort,
  ) {}

  async execute(ctx: ExecutionContext, input: UpdateMyProfileInput): Promise<void> {
    const requester = requireAuthenticated(ctx);

    // Read and authorize outside the transaction: it holds the request's only
    // connection on a { max: 1 } pool, so it stays as short as the writes.
    const profile = await this.profileRepo.findByUserId(requester.userId);
    if (!profile) throw new ProfileNotFoundError(requester.userId);

    // Captured before anything on the aggregate changes: if the identity
    // write below fails, this is what the compensating revert restores.
    const previousPhone = profile.phoneNumber;

    // Normalised before anything is compared or written: "+258 84 123 4567"
    // and "+258841234567" are one number, and the unique index that protects
    // it can only see strings.
    const nextPhone =
      input.phoneNumber === undefined
        ? undefined
        : input.phoneNumber === null || input.phoneNumber.trim() === ""
          ? null
          : normalizePhoneNumber(input.phoneNumber);

    // Only when it actually changed. Saving the form without touching the
    // phone must not clear a verification the person already went through.
    const phoneChanged = nextPhone !== undefined && nextPhone !== profile.phoneNumber;

    // A key, not a URL, and the check is the point: the upload route only
    // ever writes under `avatar/<uploaderId>/...`, so a key naming any other
    // prefix — including a real one, just not this caller's — was never
    // produced by anything this account did. The trailing slash matters: it
    // is what stops `avatar/u1x/...` from being accepted as belonging to
    // `u1`.
    if (input.avatarKey && !input.avatarKey.startsWith(`avatar/${requester.userId}/`)) {
      throw new AvatarKeyNotOwnedError();
    }

    const touchesName =
      input.firstName !== undefined ||
      input.lastName !== undefined ||
      input.displayName !== undefined;
    const touchesContact =
      nextPhone !== undefined ||
      input.bio !== undefined ||
      input.avatarKey !== undefined;
    const touchesPreferences =
      input.language !== undefined || input.timezone !== undefined;
    const touchesPersonal =
      input.dateOfBirth !== undefined || input.gender !== undefined;

    if (!touchesName && !touchesContact && !touchesPreferences && !touchesPersonal) return;

    if (touchesName) {
      profile.updateName({
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
      });
    }
    if (touchesContact) {
      profile.updateContact({
        phoneNumber: nextPhone,
        bio: input.bio,
        avatarKey: input.avatarKey,
      });
    }
    if (touchesPreferences) {
      profile.updatePreferences({
        language: input.language,
        timezone: input.timezone,
      });
    }
    if (touchesPersonal) {
      profile.updatePersonal({
        // The input carries an ISO date string; the aggregate holds a Date.
        // `null` clears the field and must survive the conversion, so it is
        // checked before the constructor rather than passed into it.
        dateOfBirth:
          input.dateOfBirth === undefined
            ? undefined
            : input.dateOfBirth === null
              ? null
              : new Date(input.dateOfBirth),
        gender: input.gender,
      });
    }

    await this.unitOfWork.atomicExecute(async () => {
      await this.profileRepo.save(profile);
    });

    // After the profile commits, not inside the transaction: the two live in
    // different modules' tables and one postgres transaction does not span
    // them anyway. THAT ORDERING STAYS.
    //
    // But `profile.phone_number` has no unique index of its own — only
    // `better_auth.user.phone_number` does — so by the time this throws (most
    // commonly PHONE_NUMBER_ALREADY_IN_USE), the profile has already
    // committed the duplicate number the identity just refused. Left alone,
    // the caller sees a failure while everything except this one write in
    // fact saved, and the profile carries a number no unique index is
    // watching. Compensate by writing the prior number back onto the profile,
    // then re-throw the ORIGINAL error — the caller must see the failure that
    // actually happened, not whatever the compensating save does.
    if (phoneChanged) {
      try {
        await this.authIdentity.setPhoneNumber(requester.userId, nextPhone ?? null);
      } catch (error) {
        profile.updateContact({ phoneNumber: previousPhone });
        try {
          await this.profileRepo.save(profile);
        } catch {
          // The compensating write failed too. Swallowed: the caller still
          // needs to see the error above, not a different one about a revert
          // it never asked for and cannot act on.
        }
        throw error;
      }
    }
  }
}
