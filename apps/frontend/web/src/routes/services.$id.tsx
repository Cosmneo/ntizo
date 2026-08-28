import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { ServiceDetailPage } from "@/features/directory/services/ui/service-detail-page";
import { prefetchServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";
import { prefetchProviderDetail } from "@/features/directory/viewmodel/use-directory";

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
  // Two reads, in order, because the second needs the first's answer. The
  // page also renders the provider behind the service — the rail's weekly
  // hours and its verification sentence are facts about the business, not
  // about the service — and `useProviderDetail` is a suspense query. Primed
  // here rather than left to suspend mid-render, so this server-rendered page
  // still arrives in one piece: without it the whole route, including the
  // service copy a crawler came for, sits behind a fallback until a second
  // round trip returns.
  loader: async ({ context, params }) => {
    const service = await prefetchServiceDetail(context.queryClient, params.id);
    if (service) {
      await prefetchProviderDetail(
        context.queryClient,
        service.providerSlug,
        i18n.resolvedLanguage ?? i18n.language,
      );
    }
    return service;
  },
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
