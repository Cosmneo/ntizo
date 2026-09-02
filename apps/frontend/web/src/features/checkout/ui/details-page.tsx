import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, TriangleAlert } from "lucide-react";
import type { AddressDTO } from "@ntizo/shared";
import { toMpesaMsisdn } from "@ntizo/shared";
import { isValidPhoneNumber } from "libphonenumber-js";
import { Button, PhoneInput, Skeleton } from "@ntizo/frontend-ui";
import { CheckoutHeader } from "@/features/checkout/ui/checkout-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { AddressForm } from "@/features/account/ui/address-form";
import {
  useAddressMutations,
  useMyAddresses,
} from "@/features/account/viewmodel/use-addresses";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import type { CheckoutBooking } from "@/features/checkout/viewmodel/use-checkout";
import { useMyBooking } from "@/features/checkout/viewmodel/use-checkout";
import { CheckoutCountdown } from "@/features/checkout/ui/checkout-countdown";
import { CheckoutRail, useWhereAndLength } from "@/features/checkout/ui/checkout-rail";
import {
  canStoreDraftDetails,
  readDraftDetails,
  saveDraftDetails,
  type DraftDetails,
} from "@/features/checkout/domain/draft-store";
import { checkoutOutcome } from "@/features/checkout/domain/booking-outcome";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { BookingOutcomePanel } from "@/features/checkout/ui/booking-outcome-panel";

/**
 * Why the phone field is refusing, or `null` when it is not.
 *
 * **Three, and they must read differently.** Now that the field carries a
 * country selector, "not a number" and "a real number M-Pesa cannot reach"
 * are genuinely different answers, and collapsing them would tell somebody
 * who picked Portugal that their perfectly valid mobile is malformed — which
 * would send them off correcting digits that were never wrong.
 */
type PhoneRefusal = "required" | "invalid" | "notVodacom";

/**
 * Which sentence each refusal prints.
 *
 * A map rather than a nested ternary at the call site: with three cases the
 * ternary stops being readable, and the next code added would be the one that
 * silently reused the wrong copy.
 */
const REFUSAL_COPY: Record<PhoneRefusal, string> = {
  required: "phoneRequired",
  invalid: "phoneInvalid",
  notVodacom: "phoneNotVodacom",
};

/**
 * The small uppercase caption that sits over every value in "Os seus dados".
 *
 * The same treatment the rail gives its "QUANDO" eyebrow, deliberately: the
 * two panels are on one screen and a second style for the same kind of label
 * would read as two designs rather than one.
 */
const FIELD_LABEL =
  "type-caption font-semibold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase";

/** One address as a single line: enough to tell two of them apart, not the whole record. */
function addressSummary(address: AddressDTO): string {
  return [address.line1, [address.district, address.city].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Which address the radio group opens on.
 *
 * The customer's own last answer wins, whether they gave it a minute ago, on
 * step 1, or before a refresh. Failing that the address book's default, which
 * is the one they told us to assume — and failing that the first row, so a
 * list that is not empty always has something chosen and the continue button
 * is never disabled for a reason nobody can see.
 *
 * **It is never asked about "outro endereço".** Step 1 records that as a
 * `null` `addressId`, and a null reaching here would be answered with the
 * saved default — silently overriding a customer who said they would give a
 * different address. The caller keeps that case out by opening the
 * add-address form for it instead; see `Details`.
 *
 * **`settled` is why the membership test is safe.** The stored choice is
 * honoured unconditionally while the list is still in flight — a bare
 * membership test would drop it to `null` on every render before the query
 * answers and put it back afterwards, which is the reason this check was left
 * out to begin with. Once the list *has* answered, an id that is not in it is
 * an id nothing on this page can render: the customer deleted that address in
 * another tab, or another device did. Returning it anyway left the radio
 * group with nothing checked beside a live continue, which sent them to step
 * 3, which found no address and sent them straight back — a loop escapable
 * only by noticing they had to click a radio, with nothing on screen saying
 * so and the hold counting down.
 *
 * A list that answered with an *error* is settled too, and falls through to
 * `null`: there is no list to check the id against and no row to draw, so the
 * continue is disabled and the page says why rather than carrying a choice it
 * cannot show.
 */
function openingAddressId(
  chosen: string | null,
  addresses: readonly AddressDTO[],
  settled: boolean,
): string | null {
  if (chosen && (!settled || addresses.some((a) => a.id === chosen))) return chosen;
  return addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null;
}

/**
 * Step 2 of checkout: who you are, where the work happens, and what needs
 * doing.
 *
 * **This page writes nothing to the booking.** The design allows one write at
 * the start of checkout (`booking.create`, which holds the slot) and one at
 * the end (`booking.submit`), and nothing between them: an intermediate
 * mutation would leave a row that is neither an abandoned draft nor a request
 * anybody sent, and a second place for the address to disagree with itself.
 * So what is collected here goes into the tab's own store and travels to step
 * 3 from there — the phone number included, which is why it can be collected
 * on this page while both of its mutations still happen on the next one.
 * Adding an address *is* a write, but to the customer's address book rather
 * than to the booking, which is the same write the account page makes.
 *
 * Split in two so the address, profile and mutation hooks below are not fired
 * for a booking this page is about to navigate away from — the same split
 * `ChooseWhenPage` makes, and for the same reason React forbids a hook that
 * runs for one render and not the next.
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
  // **One reading of the booking, shared with step 3.** This page is one
  // back-press from that one, and they used to answer the identical row two
  // different ways: an `EXPIRED` request read "the provider did not answer
  // you" there and "the provider will answer as soon as they can" here. See
  // `checkoutOutcome` for the whole mapping, including why `EXPIRED` needs
  // splitting at all.
  const outcome = booking ? checkoutOutcome(booking) : null;
  // **Two departures, because they know two different amounts.** A booking
  // this customer can read names the service and the package to go back to;
  // a `null` names nothing at all.
  const released = settled && outcome === "released";
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

  // `outcome === "released"` rather than the `released` alias: the alias is a
  // conjunction, so a reader — and the compiler — cannot conclude from its
  // being false that the outcome is not `"released"`, and the panel below
  // must be unreachable for the one outcome that has no panel.
  if (loading || unreadable || outcome === "released") {
    return (
      <DetailsShell>
        <DetailsSkeleton />
      </DetailsShell>
    );
  }

  if (failed || !booking || outcome === null) {
    return (
      <DetailsShell>
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {t("loadError")}
        </p>
      </DetailsShell>
    );
  }

  if (outcome !== "draft") {
    // Reachable by the back button after step 3 has sent the request, and by
    // a bookmark long after. There is nothing to fill in and nothing to hold:
    // `expiresAt` past `DRAFT` is somebody else's clock, so a countdown here
    // would be a checkout timer counting the provider's deadline or the
    // payment window. What the panel *says* is decided in one place shared
    // with step 3 — see `BookingOutcomePanel`.
    return (
      <DetailsShell>
        <BookingOutcomePanel booking={booking} outcome={outcome} />
      </DetailsShell>
    );
  }

  return <Details booking={booking} />;
}

/** The header and the page frame — everything that is true before the booking is. */
function DetailsShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CheckoutHeader current="details" />
      <main className="page-shell py-8">{children}</main>
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

  const {
    data: addresses = [],
    isPending: addressesLoading,
    isError: addressesFailed,
    refetch,
  } = useMyAddresses();
  const { add } = useAddressMutations();
  const { data: user } = useCurrentUser();

  // Read once, on mount. After that the page's own state is the truth and the
  // store is only written to — re-reading it every render would let a write
  // from another tab overwrite what this customer is in the middle of typing.
  const [restored] = useState(() => readDraftDetails(booking.id));
  const [chosen, setChosen] = useState<string | null>(restored?.addressId ?? null);
  const [description, setDescription] = useState(restored?.description ?? "");
  const [typedPhone, setTypedPhone] = useState<string | null>(restored?.phoneNumber ?? null);
  const [refusal, setRefusal] = useState<PhoneRefusal | null>(null);
  /**
   * The add-address form is open.
   *
   * **Seeded from step 1's answer, and this is the whole reason "outro
   * endereço" is stored as a `null` rather than as nothing.** A customer who
   * said on step 1 that they would give a different address arrives here with
   * a record whose `addressId` is null; opening on their saved default
   * instead would answer a question they had already answered, and send the
   * provider somewhere they did not ask for. `restored === null` — no record
   * at all, a bookmarked URL — is the different case, and falls through to
   * the address book.
   */
  const [adding, setAdding] = useState(
    () => restored !== null && restored.addressId === null,
  );
  /** The saved-address chooser is open, because the customer pressed "Alterar morada". */
  const [picking, setPicking] = useState(false);
  // Probed once, on mount, and by writing rather than reading — see
  // `canStoreDraftDetails`. A tab that cannot keep this page's answers cannot
  // hand them to step 3 either, and `sessionStorage` is the only channel
  // between the two, so the page says so instead of collecting an address and
  // a phone number it is going to lose at the confirm.
  const [storable] = useState(canStoreDraftDetails);

  // Derived rather than seeded by an effect: the profile arrives a render or
  // two after this component mounts, and an effect that copied it into state
  // would either overwrite what the customer had already started typing or
  // need a flag to remember that it had run.
  const phone = typedPhone ?? user?.phoneNumber ?? "";

  // The form IS the empty state. A list with nothing in it and nothing to do
  // next reads as broken software, and the customer genuinely cannot go on
  // without an address — so the thing they have to do is already on screen
  // rather than one button away.
  //
  // This asks only "is the list empty". **Whether it is readable at all is a
  // different question**, asked once beside the fieldset, because it has to
  // suppress the add button as well as the form.
  const formOpen = adding || (!addressesLoading && addresses.length === 0);
  // The saved rows show alongside the form as well as on their own, so a
  // customer who opened the form by mistake — or who was sent here by step
  // 1's "outro endereço" and has changed their mind — can still pick one.
  const chooserOpen = picking || formOpen;
  // **Nothing is selected while the form is open**, even when the address
  // book has rows to fall back on. Falling back there would leave a live
  // continue beside a half-filled new address and carry the *old* one to step
  // 3 — the customer's explicit "somewhere else" answered with the default
  // they were trying to replace.
  const selectedId = formOpen
    ? null
    : openingAddressId(chosen, addresses, !addressesLoading);
  const selected = addresses.find((a) => a.id === selectedId) ?? null;

  /**
   * Everything this page has collected so far, written whole.
   *
   * `over` wins because the caller is holding the value React has not
   * re-rendered with yet — `setChosen` does not change `selectedId` in the
   * handler that called it.
   *
   * A blank phone is stored as `null` rather than as `""`: an empty string
   * reads back as a real answer and would shadow the number already on the
   * customer's profile after a reload, which is the one value that should
   * fill this field when they have typed nothing.
   */
  function write(over: Partial<DraftDetails>) {
    saveDraftDetails(booking.id, {
      addressId: selectedId,
      description,
      phoneNumber: phone.trim() ? phone : null,
      ...over,
    });
  }

  function chooseAddress(addressId: string) {
    setChosen(addressId);
    setAdding(false);
    setPicking(false);
    write({ addressId });
  }

  function editDescription(next: string) {
    setDescription(next);
    write({ description: next });
  }

  function editPhone(next: string) {
    setTypedPhone(next);
    // Cleared the moment they start correcting it, or they read a refusal
    // about a number they have already changed.
    setRefusal(null);
    write({ phoneNumber: next.trim() ? next : null });
  }

  /** Back to step 1, on the package this booking is for. */
  function changeSlot() {
    void navigate({
      to: "/book/$serviceId",
      params: { serviceId: booking.serviceId },
      search: { optionId: booking.serviceOptionId },
    });
  }

  function goToConfirm() {
    // Checked before the address so a customer with both wrong is told about
    // the field they can see.
    const typed = phone.trim();
    if (!typed) {
      setRefusal("required");
      return;
    }
    // **`isValidPhoneNumber` first, `toMpesaMsisdn` second, and never the
    // other way round.** They refuse for different reasons and the customer
    // has to be told which: half a number is a typing mistake, where a
    // complete Portuguese mobile is a correct number in a country M-Pesa does
    // not serve. Asking the M-Pesa rule first would answer both with
    // "Vodacom", sending somebody who mistyped a Mozambican number off
    // changing their carrier.
    if (!isValidPhoneNumber(typed)) {
      setRefusal("invalid");
      return;
    }
    // **The same rule the charge uses, not a laxer one.** `82` is a real
    // Mozambican prefix and not Vodacom's: accepted here, it would fail at
    // the charge instead — after the provider had already blocked their
    // calendar for it. `booking.submit` refuses the same numbers server-side
    // and goes on doing so; this is what stops the customer meeting that
    // refusal as a failed send rather than as a sentence beside the field.
    if (!toMpesaMsisdn(typed)) {
      setRefusal("notVodacom");
      return;
    }
    if (!selectedId) return;

    setRefusal(null);
    // Written again here rather than trusted from the handlers above: a
    // customer who touched no field still has answers — the address book's
    // default, and the number already on their profile — and step 3 has to be
    // given both.
    saveDraftDetails(booking.id, { addressId: selectedId, description, phoneNumber: phone });
    // Nothing travels with it: step 3 reads the same booking, which carries
    // its own service, option, price and zone.
    void navigate({ to: "/booking/$bookingId/confirm", params: { bookingId: booking.id } });
  }

  // **In the service's zone, never the device's.** A service in
  // `Africa/Maputo` read on a device clocked to UTC drew step 1 an empty grid
  // under a live confirm button; the same substitution here would print the
  // customer a different appointment to the one they are about to ask for.
  const slot = compactSlotWording(
    booking.startsAt,
    booking.endsAt,
    locale,
    booking.timezone,
  );
  // Computed once here and handed to both panels through one helper, so the
  // copy below `lg` and the rail's above it cannot word the same appointment
  // two ways — see `useWhereAndLength`.
  const { line: whereAndLength } = useWhereAndLength(
    booking.locationType,
    booking.durationMinutes,
  );

  return (
    <>
      <CheckoutHeader current="details" />

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
            <h1 className="type-h1">{t("detailsTitle")}</h1>
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {t("detailsIntro")}
            </p>

            {/* What they picked on step 1, at the top of the step that asks
                them for everything else — and the way back to change it.

                **`lg:hidden`, and it is not a duplicate to delete.** This
                panel and the rail's "QUANDO" say the same thing with the same
                "Alterar", so exactly one of them may be on screen at a time.
                `lg` is the breakpoint because it is the one the grid above
                switches on (`lg:grid-cols-[minmax(0,1fr)_20rem]`): below it
                the rail is stacked *under* the whole form, so without this
                panel a customer scrolls past every field before learning what
                they are booking; at and above it the rail is beside the form
                and permanently in view, and a second copy inches away is
                noise. Neither can be dropped for the other — they answer
                different layouts, not different content. See follow-up #117
                for the version of this page that shipped both at once. */}
            <div className="mt-8 rounded-[var(--radius-card)] bg-[var(--color-muted)] p-4 lg:hidden">
              <div className="flex items-baseline justify-between gap-3">
                <p className={FIELD_LABEL}>{t("detailsChosenLabel")}</p>
                <button
                  type="button"
                  onClick={changeSlot}
                  className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t("railChangeAction")}
                </button>
              </div>
              <p className="type-body-medium mt-1 font-semibold tabular-nums">
                {t("railWhen", { date: slot.date, start: slot.start, end: slot.end })}
              </p>
              {/* Worded exactly as the rail words its own second line, and
                  from the same two facts — the two panels are one design and
                  a reader who meets them on two devices must not be told
                  different things. `where` disappears on its own for a
                  booking whose service carries no location type, which is the
                  `leftJoin`'s answer rather than a state the data can reach.
                  Guarded the same way the rail guards its own copy of this
                  line: unreachable today, since `durationMinutes` is
                  `.int().positive()` and `useWhereAndLength` always has a
                  length to word, but an empty paragraph is a cheap enough
                  insurance against that constraint ever loosening. */}
              {whereAndLength && (
                <p className="type-caption text-[var(--color-muted-foreground)]">
                  {whereAndLength}
                </p>
              )}
            </div>

            {!storable ? (
              // **Said, not worked around.** The address, the note and the
              // phone number reach step 3 through `sessionStorage` and
              // through nothing else, so a tab that refuses to keep them
              // cannot finish checkout — and a form rendered here would take
              // them only to lose them at the confirm, with nothing on screen
              // to explain where they went. The slot is not lost with them:
              // the draft goes on holding it for the rest of its thirty
              // minutes, in whichever window the customer opens next.
              <div className="mt-8">
                <EmptyCard
                  framed
                  badge={TriangleAlert}
                  title={t("storageBlockedTitle")}
                  body={t("storageBlockedBody")}
                />
              </div>
            ) : (
              <>
                <section className="mt-8">
                  <h2 className="type-h3 font-semibold">{t("detailsDataLegend")}</h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="grid content-start gap-1.5">
                      <p className={FIELD_LABEL}>{t("fieldNameLabel")}</p>
                      {/* Read back, not editable. `booking.submit` takes no
                          name, and changing the one on the account is the
                          account page's errand — a field here would be a
                          write this step is not allowed to make. */}
                      {user ? (
                        <p className="type-body">{user.name}</p>
                      ) : (
                        <Skeleton className="h-5 w-40" />
                      )}
                    </div>

                    <div className="grid content-start gap-1.5">
                      {/* A plain `label` rather than the kit's `Label`: this
                          one carries the uppercase caption treatment the rest
                          of the group uses, and the kit's own `text-sm` is
                          not a class `cn` knows to drop for it. */}
                      <label htmlFor="checkout-phone" className={FIELD_LABEL}>
                        {t("phoneLabel")}
                      </label>
                      {/* **The account page's own control, not a second
                          one.** `/account` splits a phone into a country and
                          a national number with this component and validates
                          it with `isValidPhoneNumber`; a bare text box here
                          would be the same field asking for the same thing
                          in a second shape, and the E.164 it emits is the
                          form the profile already stores — so a number typed
                          on either screen reads back on the other. */}
                      <PhoneInput
                        id="checkout-phone"
                        value={phone}
                        onChange={(next) => editPhone(next)}
                        // Moçambique is the launch market and M-Pesa's only
                        // one, so it is where the selector opens — the
                        // customer who has to change it is the exception.
                        defaultCountry="MZ"
                        locale={i18n.language}
                        searchPlaceholder={t("countrySearchPlaceholder")}
                        noResultsText={t("countryNoResults")}
                        countrySelectLabel={t("countrySelectLabel")}
                        aria-invalid={refusal !== null}
                        aria-describedby="checkout-phone-hint"
                      />
                      <p
                        id="checkout-phone-hint"
                        className="type-caption text-[var(--color-muted-foreground)]"
                      >
                        {t("phoneHint")}
                      </p>
                      {/* **Three refusals, worded three ways.** A country
                          selector on a field labelled "Telemóvel M-Pesa" lets
                          somebody pick a country the payment will refuse, and
                          the one thing that must not happen is that they find
                          out as a generic failure after the provider has
                          blocked their calendar. So a Portuguese mobile —
                          a perfectly good phone number that Vodacom
                          Moçambique simply cannot send a payment request to —
                          is told exactly that, here, beside the field, rather
                          than "invalid number" or nothing at all. */}
                      {refusal && (
                        <p role="alert" className="type-caption text-[var(--color-destructive)]">
                          {t(REFUSAL_COPY[refusal])}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={FIELD_LABEL}>{t("fieldAddressLabel")}</p>
                      {/* Offered rather than a trip back to step 1: going
                          back there to swap "Casa" for "Escritório" means
                          picking a time again and holding a second slot, for
                          a change that touches neither. */}
                      {!chooserOpen && !addressesFailed && selected && (
                        <button
                          type="button"
                          onClick={() => setPicking(true)}
                          className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
                        >
                          {t("addressChangeAction")}
                        </button>
                      )}
                    </div>

                    {addressesLoading ? (
                      <Skeleton className="h-24 w-full" />
                    ) : addressesFailed ? (
                      // Not the add-address form. The addresses exist;
                      // something stopped us reading them, and offering to
                      // create one more answers a transient failure with a
                      // permanent duplicate.
                      <div
                        role="alert"
                        className="grid justify-items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4"
                      >
                        <p className="type-body text-[var(--color-destructive)]">
                          {t("addressesLoadError")}
                        </p>
                        <Button type="button" variant="outline" onClick={() => void refetch()}>
                          {t("addressesRetryAction")}
                        </Button>
                      </div>
                    ) : chooserOpen ? (
                      <fieldset className="grid gap-3 border-0 p-0">
                        {/* The heading above already says "Endereço"; this
                            names the group for a screen reader without
                            printing the word twice. */}
                        <legend className="sr-only">{t("addressLegend")}</legend>

                        {addresses.map((address) => (
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
                              <span className="type-body-medium block font-semibold">
                                {address.label}
                              </span>
                              <span className="type-caption block text-[var(--color-muted-foreground)]">
                                {addressSummary(address)}
                              </span>
                            </span>
                          </label>
                        ))}

                        {formOpen ? (
                          <AddressForm
                            ariaLabel={t("newAddressTitle")}
                            submitting={add.isPending}
                            // No way out when there is nothing to go back to:
                            // a customer with no saved address has to add one
                            // to continue.
                            {...(addresses.length > 0
                              ? { onCancel: () => setAdding(false) }
                              : {})}
                            onSubmit={async (values) => {
                              const id = await add.mutateAsync(values);
                              // Awaited before selecting it, so the new row
                              // is in the list the radio group is rendering
                              // from by the time it is the chosen one.
                              await refetch();
                              chooseAddress(id);
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
                    ) : selected ? (
                      <>
                        <p className="type-body">
                          {[selected.line1, selected.line2].filter(Boolean).join(", ")}
                        </p>
                        <p className={`${FIELD_LABEL} mt-4`}>{t("fieldDistrictLabel")}</p>
                        {/* The city rides with the bairro rather than being
                            dropped: "Polana" alone names a neighbourhood in
                            more than one city, and this line is the customer
                            checking we are sending somebody to the right
                            one. */}
                        <p className="type-body">
                          {[selected.district, selected.city].filter(Boolean).join(", ")}
                        </p>
                      </>
                    ) : null}
                  </div>
                </section>

                <section className="mt-8 grid gap-1.5">
                  <label htmlFor="checkout-description" className="type-h3 font-semibold">
                    {t("descriptionLabel")}
                  </label>
                  <p className="type-caption text-[var(--color-muted-foreground)]">
                    {t("descriptionHint")}
                  </p>
                  <textarea
                    id="checkout-description"
                    rows={4}
                    // The same 1000 `booking.submit` accepts. A field that
                    // lets a customer write more than the mutation will take
                    // is a refusal at the end of checkout for something they
                    // could have been told at the start.
                    maxLength={1000}
                    value={description}
                    onChange={(e) => editDescription(e.target.value)}
                    className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
                  />
                </section>
              </>
            )}
          </div>

          {/* 80px, not 0: the checkout header is 64px and sticky, so a rail
              pinned to the top of the viewport would slide under it. */}
          <aside className="grid gap-4 lg:sticky lg:top-[80px]">
            <CheckoutRail
              // `bookingReadModel` carries no picture, and the rail draws its
              // own placeholder rather than being handed a guess.
              imageUrl={null}
              serviceName={booking.serviceName}
              providerName={booking.providerName}
              providerRatingAverage={booking.providerRatingAverage}
              providerVerified={booking.providerVerified}
              optionName={booking.optionName}
              slot={slot}
              // Off the booking now rather than passed as `null`: without it
              // the rail lost "Em sua casa" and its whole "Deslocação —
              // Incluída" line on the two steps that have only a booking, so
              // one flow's shared rail said different things on step 1 and on
              // the two that follow it.
              locationType={booking.locationType}
              durationMinutes={booking.durationMinutes}
              priceMinor={booking.priceMinor}
              currency={booking.currency}
              onChangeSlot={changeSlot}
              countdown={
                // `expiresAt` is nullable because the column is. The service
                // and the option are not: they come off the booking, so the
                // countdown always has somewhere to send the customer when
                // the hold lapses. No `sending` here — this page has no write
                // that could be in flight when the hold runs out.
                booking.expiresAt ? (
                  <CheckoutCountdown
                    expiresAt={booking.expiresAt}
                    serviceId={booking.serviceId}
                    optionId={booking.serviceOptionId}
                  />
                ) : undefined
              }
            >
              {/* `storable` as well as an address: the notice on the left
                  explains why there is nothing to fill in, and a live
                  continue beside it would carry an empty answer to step 3
                  anyway. The phone is deliberately *not* part of this
                  condition — an empty field earns a sentence saying what is
                  wrong with it, where a dead button says nothing. */}
              <Button
                type="button"
                className="w-full"
                disabled={!selectedId || !storable}
                onClick={goToConfirm}
              >
                {t("continueAction")}
              </Button>
            </CheckoutRail>
          </aside>
        </div>
      </main>
    </>
  );
}
