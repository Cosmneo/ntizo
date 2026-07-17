import { createFileRoute } from "@tanstack/react-router";
import { MembersPage } from "@/features/provider/pages/members";

export const Route = createFileRoute("/provider/members")({
  component: MembersPage,
});
