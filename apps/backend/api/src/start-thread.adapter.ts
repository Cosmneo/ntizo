import type { CommunicationBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import type { StartThreadPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";

/** The pair's conversation, created or reused — `startThread` is idempotent. */
export function startThreadOver(
  startThread: CommunicationBootstrap["useCases"]["startThread"],
): StartThreadPort {
  return {
    async execute(input) {
      const { id } = await startThread.execute(input);
      return { threadId: id };
    },
  };
}
