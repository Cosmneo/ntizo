import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, CalendarCheck, Plus } from "lucide-react";
import type { AddressDTO } from "@ntizo/shared";
import { Button, Skeleton } from "@ntizo/frontend-ui";
import { SiteHeader } from "@/shared/components/site-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { AddressForm } from "@/features/account/ui/address-form";
import {
  useAddressMutations,
  useMyAddresses,
} from "@/features/account/viewmodel/use-addresses";
import { formatAmount } from "@/features/directory/services/domain/service-card";
import type { CheckoutBooking } from "@/features/checkout/viewmodel/use-checkout";
import { useMyBooking } from "@/features/checkout/viewmodel/use-checkout";
import { CheckoutCountdown } from "@/features/checkout/ui/checkout-countdown";
import { CheckoutSteps } from "@/features/checkout/ui/checkout-steps";
import { readDraftDetails, saveDraftDetails } from "@/features/checkout/domain/draft-store";

/**
 * What `/booking/$bookingId/details` carries in its URL.
 *
 * **`serviceId` is here because `bookingReadModel` does not carry one.** The
 * booking knows its service's *name* — it is a snapshot of what was agreed,
 * not a join — so the one thing this page must be able to do without the
 * booking, send the customer back to step 1, has no other source. It travels
 * the same way step 1's slot does: in the URL, where a refresh and a shared
 * link both keep it.
 *
 * `optionId` rides along for the reason it was added to step 1 in the first
 * place. Going back without it drops the package the customer picked, and
 * they re-book the default one at a price they were never shown — the same
 * silent downgrade, one step later.
 */
interface DetailsSearch {
  serviceId?: string;
  optionId?: string;
}

/**
 * The statuses on which the slot is no longer being held for this customer.
 *
 * **A lapsed draft is a row, not a `null`.** The sweep marks it `EXPIRED` and
 * it goes on belonging to its customer, so `booking.byId` answers with it;
 * `CreateBookingCommand` marks a superseded draft the same way when the
 * customer starts a second checkout in another tab. Reading only `null` as
 * "expired" would leave the commonest case — the thirty minutes ran out —
 * rendering a form under a countdown that is already at zero.
 */
const RELEASED_STATUSES: ReadonlySet<CheckoutBooking["status"]> = new Set([
  "EXPIRED",
  "CANCELLED",
]);

/** One address as a single line: enough to tell two of them apart, not the whole record. */
function addressSummary(address: AddressDTO): string {
  return [address.line1, [address.district, address.city].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Which address the radio group opens on.
 *
 * The customer's own last answer wins, whether they gave it a minute ago or
 * before a refresh. Failing that the address book's default, which is the one
 * they told us to assume — and failing that the first row, so a list that is
 * not empty always has something chosen and the continue button is never
 * disabled for a reason nobody can see.
 *
 * Deliberately does *not* check that `chosen` is still in the list. It is
 * called on every render, including the ones where the list has not arrived
 * yet, and a membership test would drop the customer's choice to `null` on
 * each of those and put it back afterwards.
 */
function openingAddressId(chosen: string | null, addresses: readonly AddressDTO[]): string | null {
  if (chosen) return chosen;
  return addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null;
}

/**
 * Step 2 of checkout: where, and what.
 *
 * **This page writes nothing to the server.** The design allows one write at
 * the start of checkout (`booking.create`, which holds the slot) and one at
 * the end (`booking.submit`), and nothing between them: an intermediate
 * mutation would leave a row that is neither an abandoned draft nor a request
 * anybody sent, and a second place for the address to disagree with itself.
 * So what is collected here goes into the tab's own store and travels to step
 * 3 from there. Adding an address *is* a write, but to the customer's address
 * book rather than to the booking, which is the same write the account page
 * makes.
 *
 * Split in two so the address queries below are not fired for a booking this
 * page is about to navigate away from — the same split `ChooseWhenPage`
 * makes, and for the same reason React forbids a hook that runs for one
 * render and not the next.
 */
export function DetailsPage({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation("checkout");
  const { booking, loading, failed } = useMyBooking(bookingId);
  // `strict: false` rather than naming the route, so the component can be
  // mounted and tested without the router's type registry having to agree
  // with it first — the read `ChooseWhenPage` makes of its own search.
  const search = useSearch({ strict: false }) as DetailsSearch;
  const navigate = useNavigate();

  // `loading` is checked first and cannot be folded in: on the very first
  // render there is no data yet, and a bare `booking === null` would read
  // that as "your draft is gone" and bounce every customer off the page
  // before their booking had finished loading.
  const released = !loading && (booking === null || (!!booking && RELEASED_STATUSES.has(booking.status)));

  useEffect(() => {
    if (!released) return;
    // The design's failure table: "the slot was released; back to step 1 with
    // the service kept". `replace`, so the back button does not walk the
    // customer into a page whose booking is gone.
    if (search.serviceId) {
      void navigate({
        to: "/book/$serviceId",
        params: { serviceId: search.serviceId },
        search: { expired: true, ...(search.optionId ? { optionId: search.optionId } : {}) },
        replace: true,
      });
      return;
    }
    // No service to go back to — a hand-typed or long-stale URL. Browsing is
    // the honest destination; inventing a service id would send them to
    // somebody else's page.
    void navigate({ to: "/services", search: {}, replace: true });
  }, [released, navigate, search.serviceId, search.optionId]);

  if (loading || released) {
    return (
      <DetailsShell>
        <DetailsSkeleton />
      </DetailsShell>
    );
  }

  if (failed || !booking) {
    return (
      <DetailsShell>
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {t("loadError")}
        </p>
      </DetailsShell>
    );
  }

  if (booking.status !== "DRAFT") {
    // Reachable by the back button after step 3 has sent the request. There
    // is nothing to fill in and nothing to hold: `expiresAt` on a submitted
    // booking is the *provider's* response window, so a countdown here would
    // be a checkout timer counting somebody else's deadline.
    return (
      <DetailsShell>
        <EmptyCard
          framed
          badge={CalendarCheck}
          title={t("alreadySentTitle")}
          body={t("alreadySentBody")}
          action={
            <Link
              to="/bookings"
              className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t("alreadySentAction")}
            </Link>
          }
        />
      </DetailsShell>
    );
  }

  return <Details booking={booking} search={search} />;
}

/** The header, the step marker and the page frame — everything that is true before the booking is. */
function DetailsShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader current="services" />
      <main className="page-shell py-8">
        <CheckoutSteps current="details" />
        <div className="mt-8">{children}</div>
      </main>
    </>
  );
}

function DetailsSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function Details({ booking, search }: { booking: CheckoutBooking; search: DetailsSearch }) {
  const { t, i18n } = useTranslation("checkout");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();

  const { data: addresses = [], isPending: addressesLoading, refetch } = useMyAddresses();
  const { add } = useAddressMutations();

  // Read once, on mount. After that the page's own state is the truth and the
  // store is only written to — re-reading it every render would let a write
  // from another tab overwrite what this customer is in the middle of typing.
  const [restored] = useState(() => readDraftDetails(booking.id));
  const [chosen, setChosen] = useState<string | null>(restored?.addressId ?? null);
  const [description, setDescription] = useState(restored?.description ?? "");
  const [adding, setAdding] = useState(false);

  const selectedId = openingAddressId(chosen, addresses);
  // The form IS the empty state. A list with nothing in it and nothing to do
  // next reads as broken software, and the customer genuinely cannot go on
  // without an address — so the thing they have to do is already on screen
  // rather than one button away.
  const formOpen = adding || (!addressesLoading && addresses.length === 0);

  function chooseAddress(addressId: string) {
    setChosen(addressId);
    saveDraftDetails(booking.id, { addressId, description });
  }

  function editDescription(next: string) {
    setDescription(next);
    saveDraftDetails(booking.id, { addressId: selectedId, description: next });
  }

  function goToConfirm() {
    // Written again here rather than trusted from the handlers above: a
    // customer who touched neither field still has a selection — the address
    // book's default — and step 3 has to be given it.
    saveDraftDetails(booking.id, { addressId: selectedId, description });
    // `href` rather than a typed `to`: step 3 is the next slice and its route
    // does not exist yet. `serviceId` travels because step 3 shows the same
    // countdown, whose only way back to step 1 is that id.
    const forward = new URLSearchParams();
    if (search.serviceId) forward.set("serviceId", search.serviceId);
    if (search.optionId) forward.set("optionId", search.optionId);
    const query = forward.toString();
    void navigate({ href: `/booking/${booking.id}/confirm${query ? `?${query}` : ""}` });
  }

  return (
    <>
      <SiteHeader current="services" />

      <main className="page-shell py-8">
        {search.serviceId ? (
          <Link
            to="/book/$serviceId"
            params={{ serviceId: search.serviceId }}
            search={search.optionId ? { optionId: search.optionId } : {}}
            className="type-caption inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("backToWhen")}
          </Link>
        ) : null}

        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0">
            <CheckoutSteps current="details" />
            <h1 className="type-h1 mt-4">{t("detailsTitle")}</h1>
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {t("detailsIntro")}
            </p>

            <fieldset className="mt-8 grid gap-3 border-0 p-0">
              <legend className="type-h3 font-semibold">{t("addressLegend")}</legend>

              {addressesLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                addresses.map((address) => (
                  <label
                    key={address.id}
                    className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4"
                  >
                    <input
                      type="radio"
                      name="checkout-address"
                      value={address.id}
                      checked={selectedId === address.id}
                      onChange={() => chooseAddress(address.id)}
                      className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <span className="min-w-0">
                      <span className="type-body-medium block font-semibold">{address.label}</span>
                      <span className="type-caption block text-[var(--color-muted-foreground)]">
                        {addressSummary(address)}
                      </span>
                    </span>
                  </label>
                ))
              )}

              {formOpen ? (
                <AddressForm
                  ariaLabel={t("newAddressTitle")}
                  submitting={add.isPending}
                  // No way out when there is nothing to go back to: a customer
                  // with no saved address has to add one to continue.
                  {...(addresses.length > 0 ? { onCancel: () => setAdding(false) } : {})}
                  onSubmit={async (values) => {
                    const id = await add.mutateAsync(values);
                    // Awaited before selecting it, so the new row is in the
                    // list the radio group is rendering from by the time it
                    // is the chosen one.
                    await refetch();
                    chooseAddress(id);
                    setAdding(false);
                  }}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  onClick={() => setAdding(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("addressAddAction")}
                </Button>
              )}
            </fieldset>

            <div className="mt-8 grid gap-1.5">
              <label htmlFor="checkout-description" className="type-h3 font-semibold">
                {t("descriptionLabel")}
              </label>
              <p className="type-caption text-[var(--color-muted-foreground)]">
                {t("descriptionHint")}
              </p>
              <textarea
                id="checkout-description"
                rows={4}
                // The same 1000 `booking.submit` accepts. A field that lets a
                // customer write more than the mutation will take is a
                // refusal at the end of checkout for something they could
                // have been told at the start.
                maxLength={1000}
                value={description}
                onChange={(e) => editDescription(e.target.value)}
                className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
              />
            </div>
          </div>

          {/* 100px, not 0: the site header is 84px and sticky, so a rail
              pinned to the top of the viewport would slide under it. */}
          <aside className="grid gap-4 lg:sticky lg:top-[100px]">
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
              {/* Both conditions, not one. `expiresAt` is nullable because
                  the column is; `serviceId` is what the countdown navigates
                  *to* when the hold lapses, and a countdown with nowhere to
                  send the customer would strand them under a stopped timer —
                  worse than no timer at all. */}
              {booking.expiresAt && search.serviceId ? (
                <div className="mb-4">
                  <CheckoutCountdown
                    expiresAt={booking.expiresAt}
                    serviceId={search.serviceId}
                    optionId={search.optionId}
                  />
                </div>
              ) : null}

              <p className="type-caption text-[var(--color-muted-foreground)]">
                {booking.providerName}
              </p>
              <h2 className="type-h3 mt-1 font-semibold">{booking.serviceName}</h2>

              {/* The price the customer pays, exactly as the provider set it.
                  No fee line and no breakdown, because there is nothing to
                  break down: the commission comes out of the provider's
                  payout, so a split shown here would invent a charge the
                  customer is not being asked for. The query behind this page
                  does not even fetch it. */}
              <p className="type-h3 mt-4 font-semibold tabular-nums">
                {formatAmount(booking.priceMinor, booking.currency, locale)}
              </p>
              <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
                {booking.optionName}
              </p>

              <Button
                type="button"
                className="mt-4 w-full"
                disabled={!selectedId}
                onClick={goToConfirm}
              >
                {t("continueAction")}
              </Button>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
