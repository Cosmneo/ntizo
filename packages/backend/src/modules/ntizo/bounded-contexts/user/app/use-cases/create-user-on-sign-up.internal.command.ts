import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type {
  ProfileRepositoryPort,
  UserRepositoryPort,
} from "../ports/outbound";
import type {
  CreateUserOnSignUpInternalInput,
  CreateUserOnSignUpInternalPort,
} from "../ports/inbound/create-user-on-sign-up.internal.command.port";
import { User } from "../../domain/aggregates/user.aggregate";
import { Profile } from "../../domain/aggregates/profile.aggregate";

/**
 * Internal command — called from the better-auth `user.create.after` hook.
 * Idempotent: if a user already exists for this id (e.g. on retry), no-op.
 *
 * The idempotency guard sits above `atomicExecute`, which is what makes it
 * cover the event as well as the rows: a retry returns before anything is
 * created, so nothing is published and nobody is welcomed twice.
 */
export class CreateUserOnSignUpInternalCommand
  implements CreateUserOnSignUpInternalPort
{
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly profileRepo: ProfileRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: CreateUserOnSignUpInternalInput): Promise<void> {
    const existing = await this.userRepo.findById(input.userId);
    if (existing) return;

    await this.unitOfWork.atomicExecute(async () => {
      const user = User.create({
        id: input.userId,
        email: input.email,
        role: "customer",
        // better-auth declares `firstName` with `defaultValue: ""`, so a
        // signup without one arrives as an empty string rather than as
        // absent. Normalising it to null here — at the edge that knows where
        // the value came from — keeps "no name known" out of the event
        // payload as `""`, which a template would render as "Welcome, !".
        firstName: input.firstName.trim() || null,
      });
      await this.userRepo.save(user);

      const profile = Profile.create({
        userId: input.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        // Only when we actually resolved one. `undefined` lets the aggregate
        // apply the platform default; passing null would mean writing "no
        // language" into a column that has to hold one.
        ...(input.language ? { language: input.language } : {}),
        // Same rule, same reason: UTC is the aggregate's default, and an
        // absent header is not an instruction to store an empty timezone.
        ...(input.timezone ? { timezone: input.timezone } : {}),
        avatarUrl: input.image ?? null,
      });
      // Through the aggregate's own method rather than passed into `create`:
      // a phone is a contact detail a user changes later, and `create` takes
      // only what a profile cannot exist without.
      if (input.phoneNumber) profile.updateContact({ phoneNumber: input.phoneNumber });
      await this.profileRepo.save(profile);

      // Inside the transaction, and last, exactly as every Provider command
      // does it: the outbox row and the user row commit or roll back
      // together, and a sign-up that failed halfway announces nothing.
      await this.outboxPort.publish(user.pullEvents(), "user");
    });
  }
}
