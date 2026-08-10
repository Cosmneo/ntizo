import { randomUUID } from "node:crypto";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { AddressRepositoryPort } from "../ports/outbound/address.repository.port";
import type {
  AddMyAddressInput,
  AddMyAddressPort,
  DeleteMyAddressInput,
  DeleteMyAddressPort,
  UpdateMyAddressInput,
  UpdateMyAddressPort,
} from "../ports/inbound/address.command.port";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../shared/infrastructure/execution-context";
import { Address } from "../../domain/aggregates/address.aggregate";
import { AddressNotFoundError } from "../../domain/exceptions/address.exceptions";

/**
 * The three writes over the caller's own addresses.
 *
 * As with the profile, the subject is always the authenticated user and never
 * anything the caller supplies. The repository takes the owner id on every
 * method, so "is this mine" is part of the query rather than a check somebody
 * has to remember to perform first.
 */
export class AddMyAddressCommand implements AddMyAddressPort {
  constructor(
    private readonly repo: AddressRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(ctx: ExecutionContext, input: AddMyAddressInput): Promise<{ id: string }> {
    const requester = requireAuthenticated(ctx);
    const existing = await this.repo.listByUserId(requester.userId);

    const address = Address.create({
      ...input,
      id: randomUUID(),
      userId: requester.userId,
      // The first address a user saves is their default whether they asked or
      // not. Any later one is only default if they say so.
      isDefault: existing.length === 0 ? true : (input.isDefault ?? false),
    });

    await this.unitOfWork.atomicExecute(async () => {
      await this.repo.save(address);
      if (address.isDefault) {
        await this.repo.clearDefaultForUser(requester.userId, address.id);
      }
    });

    return { id: address.id };
  }
}

export class UpdateMyAddressCommand implements UpdateMyAddressPort {
  constructor(
    private readonly repo: AddressRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(ctx: ExecutionContext, input: UpdateMyAddressInput): Promise<void> {
    const requester = requireAuthenticated(ctx);
    const address = await this.repo.findByIdForUser(input.addressId, requester.userId);
    if (!address) throw new AddressNotFoundError(input.addressId);

    const { addressId: _id, isDefault, ...fields } = input;
    address.update(fields);
    if (isDefault === true) address.setDefault(true);

    await this.unitOfWork.atomicExecute(async () => {
      await this.repo.save(address);
      // Promoting one demotes the rest. The aggregate cannot do this itself —
      // "exactly one default" is a rule about the set, not about a member.
      if (isDefault === true) {
        await this.repo.clearDefaultForUser(requester.userId, address.id);
      }
    });
  }
}

export class DeleteMyAddressCommand implements DeleteMyAddressPort {
  constructor(
    private readonly repo: AddressRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(ctx: ExecutionContext, input: DeleteMyAddressInput): Promise<void> {
    const requester = requireAuthenticated(ctx);
    const address = await this.repo.findByIdForUser(input.addressId, requester.userId);
    if (!address) throw new AddressNotFoundError(input.addressId);

    await this.unitOfWork.atomicExecute(async () => {
      await this.repo.delete(input.addressId, requester.userId);

      // Deleting the default promotes whatever is left, so a user never ends
      // up with addresses and no default — a state nothing else checks for
      // and every booking form would have to handle.
      if (address.isDefault) {
        const remaining = await this.repo.listByUserId(requester.userId);
        const next = remaining[0];
        if (next) {
          next.setDefault(true);
          await this.repo.save(next);
        }
      }
    });
  }
}
