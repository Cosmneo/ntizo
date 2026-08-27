import { createFileRoute } from "@tanstack/react-router";
import { CustomerMessagesPage } from "@/features/messaging/ui/customer-messages-page";

/**
 * `?thread=<id>` is the whole search schema: which conversation is open,
 * carried in the URL rather than component state so a direct link (the
 * "message this provider" button on `provider-hero.tsx`, or a reload) lands
 * on the right conversation instead of the inbox's default "pick one" state.
 * An empty or non-string value is read as "none selected" rather than
 * rejected — an unrecognisable id still opens the list, it just finds no
 * matching thread rather than crashing.
 */
export const Route = createFileRoute("/_customer/messages")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => {
    const thread = search["thread"];
    return typeof thread === "string" && thread.length > 0 ? { thread } : {};
  },
  component: CustomerMessagesPage,
});
