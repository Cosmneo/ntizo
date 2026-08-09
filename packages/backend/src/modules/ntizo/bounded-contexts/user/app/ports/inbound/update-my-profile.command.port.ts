import type { Locale } from "@ntizo/shared";
import type { ExecutionContext } from "../../../../../shared/infrastructure/execution-context";

/**
 * Every field is optional and `undefined` means "leave alone" — the aggregate's
 * update methods are written that way, so a partial update never has to read
 * and re-send the fields it is not changing.
 *
 * `phoneNumber`, `bio` and `avatarUrl` accept `null` distinctly from
 * `undefined`: null clears the value, undefined leaves it. Collapsing the two
 * would make it impossible to remove a phone number once set.
 */
export interface UpdateMyProfileInput {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phoneNumber?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  language?: Locale;
  timezone?: string;
}

export interface UpdateMyProfilePort {
  execute(ctx: ExecutionContext, input: UpdateMyProfileInput): Promise<void>;
}
