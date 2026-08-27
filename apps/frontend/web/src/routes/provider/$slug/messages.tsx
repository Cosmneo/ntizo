import { createFileRoute } from "@tanstack/react-router";
import { ProviderMessagesPage } from "@/features/messaging/ui/provider-messages-page";

/**
 * `?thread=<id>` is the whole search schema — same reasoning
 * `routes/_customer/messages.tsx` documents for the identical shape: which
 * conversation is open lives in the URL, not component state, so a direct
 * link and a reload both land on the right conversation instead of the
 * inbox's default "pick one" state.
 */
export const Route = createFileRoute("/provider/$slug/messages")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => {
    const thread = search["thread"];
    return typeof thread === "string" && thread.length > 0 ? { thread } : {};
  },
  component: ProviderMessagesPage,
});
