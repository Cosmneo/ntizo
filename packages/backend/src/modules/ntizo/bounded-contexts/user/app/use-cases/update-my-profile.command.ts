import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { ProfileRepositoryPort } from "../ports/outbound";
import type {
  UpdateMyProfileInput,
  UpdateMyProfilePort,
} from "../ports/inbound/update-my-profile.command.port";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../shared/infrastructure/execution-context";
import { ProfileNotFoundError } from "../../domain/exceptions";

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
  ) {}

  async execute(ctx: ExecutionContext, input: UpdateMyProfileInput): Promise<void> {
    const requester = requireAuthenticated(ctx);

    // Read and authorize outside the transaction: it holds the request's only
    // connection on a { max: 1 } pool, so it stays as short as the writes.
    const profile = await this.profileRepo.findByUserId(requester.userId);
    if (!profile) throw new ProfileNotFoundError(requester.userId);

    const touchesName =
      input.firstName !== undefined ||
      input.lastName !== undefined ||
      input.displayName !== undefined;
    const touchesContact =
      input.phoneNumber !== undefined ||
      input.bio !== undefined ||
      input.avatarUrl !== undefined;
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
        phoneNumber: input.phoneNumber,
        bio: input.bio,
        avatarUrl: input.avatarUrl,
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
  }
}
