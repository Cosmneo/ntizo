import { createFileRoute } from "@tanstack/react-router";
import { MessagesPage } from "@/features/account/ui/placeholder-pages";

export const Route = createFileRoute("/_customer/messages")({
  component: MessagesPage,
});
