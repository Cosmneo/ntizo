import type { InboxPageDTO, UnreadCountDTO } from "@ntizo/shared/read-models";
import type { NotificationRepositoryPort } from "../../../../bounded-contexts/notification/app/ports/outbound/notification.repository.port";
import type { ProviderMemberReaderPort } from "../../../../bounded-contexts/notification/app/ports/outbound/provider-member-reader.port";
import { NotProviderMemberError } from "../../../../bounded-contexts/notification/domain/exceptions";

/**
 * The default page, and the ceiling.
 *
 * Both live here rather than as zod `.default()` on the field: a zod default
 * does not survive into the GraphQL schema — the argument still emits as
 * `Int!` and every caller has to send it. The clamp is here for the same
 * reason it is here on every other paged query in this codebase: `limit` is
 * caller-controlled and an unbounded one is a way to ask for the whole table.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function page(limit: number | undefined, offset: number | undefined) {
  return {
    limit: Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT),
    offset: Math.max(offset ?? 0, 0),
  };
}

export class ListMyNotificationsProjection {
  constructor(private readonly repo: NotificationRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<InboxPageDTO> {
    const { limit, offset } = page(input.limit, input.offset);
    return this.repo.listForUser(input.requesterUserId, limit, offset);
  }
}

/**
 * A workspace's inbox, for one of its members.
 *
 * The membership check is here rather than in the repository's statement,
 * unlike `markRead`: this refuses a whole inbox, and returning an empty page to
 * a non-member would tell them the workspace exists and has nothing in it —
 * which is a different lie from "that is not yours to read".
 */
export class ListProviderNotificationsProjection {
  constructor(
    private readonly repo: NotificationRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    providerId: string;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<InboxPageDTO> {
    if (!(await this.members.isMember(input.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError(input.providerId);
    }
    const { limit, offset } = page(input.limit, input.offset);
    return this.repo.listForProvider(input.providerId, input.requesterUserId, limit, offset);
  }
}

/**
 * The badge's number, for whichever inbox is asked about.
 *
 * Its own projection rather than `list().total`: the bell polls this on an
 * interval and has no use for the rows, and fetching twenty of them every
 * thirty seconds to display one integer is the kind of thing that only shows up
 * on somebody else's bill.
 */
export class CountUnreadProjection {
  constructor(
    private readonly repo: NotificationRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
  ) {}

  async forUser(requesterUserId: string): Promise<UnreadCountDTO> {
    return { count: await this.repo.countUnreadForUser(requesterUserId) };
  }

  async forProvider(requesterUserId: string, providerId: string): Promise<UnreadCountDTO> {
    if (!(await this.members.isMember(providerId, requesterUserId))) {
      throw new NotProviderMemberError(providerId);
    }
    return { count: await this.repo.countUnreadForProvider(providerId, requesterUserId) };
  }
}
