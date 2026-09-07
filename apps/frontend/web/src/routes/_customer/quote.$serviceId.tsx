import { createFileRoute } from "@tanstack/react-router";
import { prefetchServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";
import { RequestQuotePage } from "@/features/quotes/ui/request-page";

/**
 * The request lives under `_customer` rather than beside `/book/$serviceId`,
 * because unlike checkout's first step it is signed-in only: there is nobody
 * to attribute an anonymous request to. The layout's own `beforeLoad` already
 * bounces a visitor to `/sign-in?next=…` and brings them back here.
 *
 * The loader warms the service detail so `useServiceDetail`'s suspense query
 * has an answer before the component mounts, exactly as `book.$serviceId`
 * does it. `prefetchServiceDetail` is imported from the viewmodel, not from
 * `data/service-detail.repository` — the only place it is actually exported
 * from, and the only import a `routes` file may take (`boundaries/dependencies`
 * forbids `routes → data`), which is also how `book.$serviceId.tsx` and
 * `services.$id.tsx` both already import it.
 */
export const Route = createFileRoute("/_customer/quote/$serviceId")({
  loader: ({ context, params }) => prefetchServiceDetail(context.queryClient, params.serviceId),
  component: RequestQuote,
});

function RequestQuote() {
  const { serviceId } = Route.useParams();
  return <RequestQuotePage key={serviceId} serviceId={serviceId} />;
}
