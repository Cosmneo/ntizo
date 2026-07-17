import { createFileRoute, redirect } from "@tanstack/react-router";
import { listMyProviders } from "@/features/provider/lib/provider-api";

export const Route = createFileRoute("/provider/")({
  beforeLoad: async () => {
    try {
      const list = await listMyProviders();
      throw redirect({ to: list.length === 0 ? "/provider/no-provider" : "/provider/overview" });
    } catch (e) {
      if (e && typeof e === "object" && "to" in (e as object)) throw e;
      throw redirect({ to: "/provider/no-provider" });
    }
  },
});
