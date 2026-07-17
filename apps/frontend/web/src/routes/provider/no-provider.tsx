import { createFileRoute } from "@tanstack/react-router";
import { NoProviderPage } from "@/features/provider/pages/no-provider";

export const Route = createFileRoute("/provider/no-provider")({
  component: NoProviderPage,
});
