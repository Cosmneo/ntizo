import { createFileRoute } from "@tanstack/react-router";
import { ProviderDetailPage } from "@/features/directory/ui/provider-detail-page";
import { prefetchProviderDetail } from "@/features/directory/viewmodel/use-directory";

/**
 * A provider's public page — the route that actually earns organic traffic.
 *
 * `ssr: true` and no prerender entry, for the same reason as the directory:
 * prerendering would need the slug list at build time and would freeze it.
 *
 * `head` reads the loader's result so each provider gets its own title and
 * description. Without that every provider page would carry the root's
 * "Ntizo" title, which is close to worthless in a search result list.
 */
export const Route = createFileRoute("/providers/$slug")({
  ssr: true,
  loader: ({ context, params }) => prefetchProviderDetail(context.queryClient, params.slug),
  head: ({ loaderData }) => {
    const provider = loaderData ?? null;
    if (!provider) return { meta: [{ title: "Ntizo" }] };
    const place = [provider.city, provider.country].filter(Boolean).join(", ");
    return {
      meta: [
        { title: `${provider.name}${place ? ` · ${place}` : ""} · Ntizo` },
        {
          name: "description",
          content:
            provider.description?.slice(0, 155) ??
            `${provider.name}${place ? ` in ${place}` : ""} on Ntizo.`,
        },
      ],
    };
  },
  component: ProviderDetail,
});

function ProviderDetail() {
  const { slug } = Route.useParams();
  return <ProviderDetailPage slug={slug} />;
}
