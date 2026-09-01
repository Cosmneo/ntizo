import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarCheck, Plus, TriangleAlert } from "lucide-react";
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
import {
  canStoreDraftDetails,
  readDraftDetails,
  saveDraftDetails,
} from "@/features/checkout/domain/draft-store";
import { RELEASED_STATUSES } from "@/features/checkout/domain/released-statuses";

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
  const navigate = useNavigate();

  // `loading` is checked first and cannot be folded in: on the very first
  // render there is no data yet, and a bare `booking === null` would read
  // that as "your draft is gone" and bounce every customer off the page
  // before their booking had finished loading.
  const settled = !loading && !failed;
  // **Two departures, because they know two different amounts.** A booking
  // this customer can read names the service and the package to go back to;
  // a `null` names nothing at all.
  const released = settled && !!booking && RELEASED_STATUSES.has(booking.status);
  const unreadable = settled && booking === null;

  useEffect(() => {
    // The design's failure table: "the slot was released; back to step 1 with
    // the service kept" — and the service is the booking's own, read off the
    // row rather than carried alongside it, so there is no second copy for a
    // shared link to disagree with. `replace`, so the back button does not
    // walk the customer into a page whose booking is gone.
    if (released && booking) {
      void navigate({
        to: "/book/$serviceId",
        params: { serviceId: booking.serviceId },
        search: { expired: true, optionId: booking.serviceOptionId },
        replace: true,
      });
      return;
    }
    // **`null` cannot mean "back to step 1 with the service kept", because
    // there is no service to keep.** It is how the server answers for a
    // booking that is not this customer's, or an id that never named one, and
    // reconstructing step 1 from anything else on the page would be guessing
    // at a booking we are not allowed to read. Browsing is the honest
    // destination.
    if (unreadable) void navigate({ to: "/services", search: {}, replace: true });
  }, [released, unreadable, booking, navigate]);

  if (loading || released || unreadable) {
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

  return <Details booking={booking} />;
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

function Details({ booking }: { booking: CheckoutBooking }) {
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
  // Probed once, on mount, and by writing rather than reading — see
  // `canStoreDraftDetails`. A tab that cannot keep this page's answers cannot
  // hand them to step 3 either, and `sessionStorage` is the only channel
  // between the two, so the page says so instead of collecting an address it
  // is going to lose at the confirm.
  const [storable] = useState(canStoreDraftDetails);

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
    // A typed `to` now that step 3's route exists — this was an untyped
    // `href` for exactly as long as it named a page nobody had written.
    // Nothing travels with it: step 3 reads the same booking, which carries
    // its own service, option, price and zone.
    void navigate({ to: "/booking/$bookingId/confirm", params: { bookingId: booking.id } });
  }

  return (
    <>
      <SiteHeader current="services" />

      <main className="page-shell py-8">
        <Link
          to="/book/$serviceId"
          params={{ serviceId: booking.serviceId }}
          search={{ optionId: booking.serviceOptionId }}
          className="type-caption inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t("backToWhen")}
        </Link>

        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0">
            <CheckoutSteps current="details" />
            <h1 className="type-h1 mt-4">{t("detailsTitle")}</h1>
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {t("detailsIntro")}
            </p>

            {!storable ? (
              // **Said, not worked around.** The address and the note reach
              // step 3 through `sessionStorage` and through nothing else, so
              // a tab that refuses to keep them cannot finish checkout — and
              // a form rendered here would take an address only to lose it at
              // the confirm, with nothing on screen to explain where it went.
              // The slot is not lost with it: the draft goes on holding it
              // for the rest of its thirty minutes, in whichever window the
              // customer opens next.
              <EmptyCard
                framed
                badge={TriangleAlert}
                title={t("storageBlockedTitle")}
                body={t("storageBlockedBody")}
              />
            ) : (
            <>
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
            </>
            )}
          </div>

          {/* 100px, not 0: the site header is 84px and sticky, so a rail
              pinned to the top of the viewport would slide under it. */}
          <aside className="grid gap-4 lg:sticky lg:top-[100px]">
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
              {/* `expiresAt` is nullable because the column is. The service
                  and the option are not: they come off the booking, so the
                  countdown always has somewhere to send the customer when the
                  hold lapses. */}
              {booking.expiresAt ? (
                <div className="mb-4">
                  <CheckoutCountdown
                    expiresAt={booking.expiresAt}
                    serviceId={booking.serviceId}
                    optionId={booking.serviceOptionId}
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

              {/* `storable` as well as an address: the notice on the left
                  explains why there is nothing to fill in, and a live
                  continue beside it would carry an empty answer to step 3
                  anyway. */}
              <Button
                type="button"
                className="mt-4 w-full"
                disabled={!selectedId || !storable}
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
