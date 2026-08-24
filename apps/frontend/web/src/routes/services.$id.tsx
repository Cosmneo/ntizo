import { createFileRoute } from "@tanstack/react-router";
import { ServiceDetailPage } from "@/features/directory/services/ui/service-detail-page";
import { prefetchServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";

/**
 * One service's public page, at `/services/<id>`.
 *
 * A sibling of `services.index.tsx`, not a child: that file's own comment
 * explains why it carries the `.index` suffix, and this is the route it was
 * protecting the browse from becoming a layout for.
 *
 * `ssr: true` and deliberately not prerendered — a service frozen at build
 * time goes stale the moment its provider edits a price.
 */
export const Route = createFileRoute("/services/$id")({
  ssr: true,
  loader: ({ context, params }) => prefetchServiceDetail(context.queryClient, params.id),
  head: ({ loaderData }) => {
    const s = loaderData ?? null;
    if (!s) return { meta: [{ title: "Ntizo" }] };
    const place = [s.providerCity, s.providerDistrict].filter(Boolean).join(", ");
    return {
      meta: [
        { title: `${s.name} · ${s.providerName} · Ntizo` },
        {
          name: "description",
          content: s.description?.slice(0, 155) ?? `${s.name}${place ? ` — ${place}` : ""}.`,
        },
      ],
    };
  },
  component: ServiceDetail,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  return <ServiceDetailPage id={id} />;
}
