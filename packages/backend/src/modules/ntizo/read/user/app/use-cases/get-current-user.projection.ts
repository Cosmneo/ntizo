import type { CurrentUserDTO } from "@ntizo/shared";
import type {
  GetCurrentUserProjectionInput,
  GetCurrentUserProjectionPort,
} from "../ports/inbound";
import type { UserReadRepositoryPort } from "../ports/outbound/user-read.repository.port";

export class GetCurrentUserProjection implements GetCurrentUserProjectionPort {
  constructor(private readonly repo: UserReadRepositoryPort) {}

  async execute(input: GetCurrentUserProjectionInput): Promise<CurrentUserDTO> {
    const dto = await this.repo.findCurrentUser(input.requestedByUserId);
    // Throw rather than return null: the id came from a validated session, so a
    // missing row is a broken invariant, not an ordinary "not found". The output
    // schema is non-nullable, so returning null would fail kit validation with a
    // far less legible error.
    if (!dto) throw new Error("[read/user] current user not found");
    return dto;
  }
}
