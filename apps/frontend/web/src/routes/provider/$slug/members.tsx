import { createFileRoute } from "@tanstack/react-router";
import { MembersPage } from "@/features/provider/ui/members";

export const Route = createFileRoute("/provider/$slug/members")({
  component: MembersPage,
});
