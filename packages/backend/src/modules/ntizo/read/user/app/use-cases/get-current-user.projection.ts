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
    //
    // Deliberately a bare Error, not a typed kit exception (contrast
    // ProviderNotFoundError etc. in bounded-contexts/provider/domain/exceptions):
    // the kit doesn't recognise a plain Error, so it gets masked to a generic
    // INTERNAL_ERROR and this message never reaches the client. That's the
    // intended behavior here — a missing row for a session-validated id is an
    // internal invariant violation, not a domain condition worth a stable public
    // error code. Do not "fix" this into a typed error; that would leak the
    // detail to the client instead of masking it.
    if (!dto) throw new Error("[read/user] current user not found");
    return dto;
  }
}
