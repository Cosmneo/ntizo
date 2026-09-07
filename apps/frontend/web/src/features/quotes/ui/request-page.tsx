import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, PackageX, Plus, Star } from "lucide-react";
import { hasContact } from "@ntizo/shared/text";
import { Button, Skeleton, buttonVariants } from "@ntizo/frontend-ui";
import { BrandImage } from "@/shared/components/brand-image";
import { EmptyCard } from "@/shared/components/empty-card";
import { formatRating } from "@/shared/domain/rating";
import { toAddressInput } from "@/shared/domain/address-input";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { useServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";
import { useRequestQuote } from "@/features/quotes/viewmodel/use-my-quotes";
import { useAttachments } from "@/features/messaging/viewmodel/use-attachments";
import { QuoteAttachmentPicker } from "@/features/quotes/ui/attachment-picker";
import { AddressForm } from "@/features/account/ui/address-form";
import { useAddressMutations, useMyAddresses } from "@/features/account/viewmodel/use-addresses";

const FORM_LABEL = "text-sm font-medium";
const CAPTION =
  "type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase";
const CARD = "rounded-[var(--radius-card)] border border-[var(--color-border)] p-4 sm:p-5";
const TEXT_FIELD =
  "w-full rounded-[var(--radius-field)] border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-2.5 text-sm";

/** The three steps of the rail's "O que acontece a seguir" — a real sequence, so numbered rather than bulleted. */
const NEXT_STEPS = [
  ["request.step1Title", "request.step1Body"],
  ["request.step2Title", "request.step2Body"],
  ["request.step3Title", "request.step3Body"],
] as const;

/**
 * The server codes `quoteRequest` can throw that deserve their own sentence.
 * Anything else — including no code at all — falls back to `errorGeneric`.
 */
const REQUEST_ERROR_COPY: Record<string, string> = {
  CONTACT_DETECTED: "request.errorContact",
  QUOTE_ALREADY_OPEN: "request.errorAlreadyOpen",
  QUOTE_SERVICE_NOT_QUOTABLE: "request.errorNotQuotable",
};

/** One saved address, as a line an envelope would carry: label, street, then the bairro with its city. */
function addressSummary(address: {
  line1: string;
  line2: string | null;
  district: string | null;
  city: string;
}): string {
  return [
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.district, address.city].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Plate 2 of the mockup: one form asking exactly what the provider configured
 * for this service, and a rail saying who answers, by when, and what happens
 * next.
 *
 * `useServiceDetail` is a suspense query already primed by the route's own
 * loader (`prefetchServiceDetail`), so there is no local loading state to
 * draw for it — by the time this component mounts, the answer is already in
 * the cache. `service === null` is still real, though: a stale link or a
 * removed service reaches this page with no service to describe, and gets
 * the same "not found" card `choose-when-page.tsx` shows for the identical
 * case, off the `directory` namespace both pages already share it from.
 */
export function RequestQuotePage({ serviceId }: { serviceId: string }) {
  const { t, i18n } = useTranslation("quotes");
  const { t: td } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const service = useServiceDetail(serviceId);
  const request = useRequestQuote();
  const attachments = useAttachments();
  const { add } = useAddressMutations();

  const [description, setDescription] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [addressId, setAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // The provider asks for the address when they need it to price the job; the
  // job happening at the customer's home forces the question regardless,
  // because a booking past DRAFT must carry one and asking here beats
  // ambushing them on the acceptance page.
  const form = service?.quoteForm ?? null;
  const wantsAddress = (form?.askLocation ?? false) || service?.locationType === "at_customer";
  const addresses = useMyAddresses({ enabled: wantsAddress });

  // Declared above every early return, with every other hook — a service
  // that turns out not to exist must not have skipped a hook the render
  // after it does.
  if (!service) {
    // No `<main>`/`page-shell` of its own — `_customer`'s own `CustomerShell`
    // already renders both around every page in this layout, and a second
    // pair would nest one `main` landmark inside another and double both the
    // horizontal gutter and the vertical padding. Same choice
    // `bookings-page.tsx` and `booking-page.tsx` make for their own
    // not-found cards.
    return (
      <EmptyCard
        framed
        badge={PackageX}
        title={td("serviceNotFoundTitle")}
        body={td("serviceNotFoundBody")}
        action={
          <Link
            to="/services"
            className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {td("serviceNotFoundAction")}
          </Link>
        }
      />
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setRefusal(null);

    const text = description.trim();
    if (text === "") return setRefusal("request.errorDescriptionRequired");
    // The same detector the backend runs, run here so the refusal arrives in
    // the moment rather than after a round trip.
    if (hasContact(text)) return setRefusal("request.errorContact");

    const chosen = addresses.data?.find((a) => a.id === addressId) ?? null;
    if (wantsAddress && chosen === null) return setRefusal("request.errorAddressRequired");

    // Uploads run once, at submit, and resolve to null on the first failure —
    // never a partial list. The picker shows which file and why.
    const uploaded = await attachments.uploadAll();
    if (uploaded === null) return;

    try {
      const { quoteId } = await request.mutateAsync({
        serviceId,
        description: text,
        locale,
        ...(neededBy !== "" ? { neededBy } : {}),
        ...(chosen ? { address: toAddressInput(chosen) } : {}),
        ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
      });
      await navigate({ to: "/quotes/$quoteId", params: { quoteId } });
    } catch (error) {
      const code = error instanceof GraphqlError ? error.code : undefined;
      setRefusal(REQUEST_ERROR_COPY[code ?? ""] ?? "request.errorGeneric");
    }
  }

  const savedAddresses = addresses.data ?? [];
  const addressFormOpen = addingAddress || (!addresses.isPending && savedAddresses.length === 0);
  const busy = request.isPending || attachments.uploading;

  // No `<main>`/`page-shell` of its own — see the not-found branch's own
  // note above for why. DOM order alone (form, then aside) is what puts the
  // form first on a phone, where only the unprefixed grid column exists —
  // an `order` pair here would fight that rather than describe it.
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <form onSubmit={submit} className="min-w-0 grid gap-6">
        <div>
          <p className="type-caption text-[var(--color-muted-foreground)]">{service.name}</p>
          <h1 className="type-h1">{t("request.title")}</h1>
          <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
            {t("request.lead", { provider: service.providerName })}
          </p>
        </div>

        {/* The one thing on the page in the provider's own voice. */}
        {form?.intro && (
          <div className={`${CARD} bg-[var(--color-muted)]`}>
            <p className="type-body">
              <span className="font-semibold">
                {t("request.introBy", { provider: service.providerName })}
              </span>{" "}
              {form.intro}
            </p>
          </div>
        )}

        <div className="grid gap-1.5">
          <label htmlFor="quote-description" className={FORM_LABEL}>
            {t("request.descriptionLabel")}
          </label>
          <textarea
            id="quote-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("request.descriptionPlaceholder")}
            rows={5}
            className={TEXT_FIELD}
          />
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("request.descriptionHint")}
          </p>
        </div>

        {form?.askDeadline && (
          <div className="grid gap-1.5">
            <label htmlFor="quote-needed-by" className={FORM_LABEL}>
              {t("request.neededByLabel")}{" "}
              <span className="font-normal text-[var(--color-muted-foreground)]">
                ({t("request.optional")})
              </span>
            </label>
            <input
              id="quote-needed-by"
              type="date"
              value={neededBy}
              onChange={(event) => setNeededBy(event.target.value)}
              className={`${TEXT_FIELD} sm:w-56`}
            />
          </div>
        )}

        {form?.askPhotos && (
          <div className="grid gap-2">
            <p className={FORM_LABEL}>{t("request.photosLabel")}</p>
            <QuoteAttachmentPicker
              inputId="quote-photos"
              label={t("request.photosAction")}
              hint={t("request.photosHint")}
              files={attachments.files}
              onAdd={attachments.add}
              onRemove={attachments.remove}
              disabled={attachments.uploading}
            />
          </div>
        )}

        {wantsAddress && (
          <div className="grid gap-2">
            {addresses.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : addresses.isError ? (
              <div role="alert" className="grid justify-items-start gap-3">
                <p className="type-body text-[var(--color-destructive)]">
                  {t("request.addressLoadError")}
                </p>
                <Button type="button" variant="outline" onClick={() => void addresses.refetch()}>
                  {t("request.retry")}
                </Button>
              </div>
            ) : (
              <fieldset className="grid gap-3 border-0 p-0">
                {/* Sr-only: nothing above this fieldset names the group
                    visually, and `addressNote` right below already reads as
                    the section's caption for a sighted customer. */}
                <legend className="sr-only">{t("request.addressLegend")}</legend>

                {savedAddresses.map((address) => (
                  <label
                    key={address.id}
                    className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-4"
                  >
                    <input
                      type="radio"
                      name="quote-address"
                      value={address.id}
                      checked={addressId === address.id}
                      onChange={() => setAddressId(address.id)}
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

                {addressFormOpen ? (
                  <AddressForm
                    ariaLabel={t("request.addressLegend")}
                    submitting={add.isPending}
                    // No way out when there is nothing to go back to: a
                    // customer with no saved address has to add one to
                    // continue.
                    {...(savedAddresses.length > 0
                      ? { onCancel: () => setAddingAddress(false) }
                      : {})}
                    onSubmit={async (values) => {
                      const id = await add.mutateAsync(values);
                      // Awaited before selecting it, so the new row is in
                      // the list the radio group is rendering from by the
                      // time it is the chosen one.
                      await addresses.refetch();
                      setAddressId(id);
                      setAddingAddress(false);
                    }}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => setAddingAddress(true)}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("request.addressAddAction")}
                  </Button>
                )}
              </fieldset>
            )}
            <p className="type-caption text-[var(--color-muted-foreground)]">
              {t("request.addressNote")}
            </p>
          </div>
        )}

        {refusal && (
          <p role="alert" className="type-caption text-[var(--color-destructive)]">
            {t(refusal)}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {t("request.submit")}
          </Button>
          <Link
            to="/services/$id"
            params={{ id: serviceId }}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("request.cancel")}
          </Link>
        </div>
      </form>

      <aside className="grid gap-6 lg:self-start">
        <section className={CARD}>
          <h2 className={CAPTION}>{t("request.railWho")}</h2>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
              <BrandImage
                src={service.providerLogoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </span>
            <div className="min-w-0">
              <p className="type-body-medium truncate font-semibold">{service.providerName}</p>
              {/* Each half disappears on its own when it has nothing to
                  say — an unreviewed business shows no score rather than a
                  zero, and an unverified one shows no badge rather than a
                  greyed-out promise. The same rule `checkout-rail`'s trust
                  line and `booking-page.tsx`'s `trustLine` both state in
                  full. */}
              <p className="type-caption flex flex-wrap items-center gap-x-1.5 text-[var(--color-muted-foreground)]">
                {service.providerRatingAverage !== null && (
                  <span className="inline-flex items-center gap-0.5 tabular-nums">
                    {formatRating(service.providerRatingAverage, locale)}
                    <Star
                      className="h-3 w-3 fill-[var(--color-warning)] text-[var(--color-warning)]"
                      aria-hidden="true"
                    />
                  </span>
                )}
                {service.providerVerified && (
                  <>
                    {service.providerRatingAverage !== null && (
                      <span aria-hidden="true">·</span>
                    )}
                    <span className="inline-flex items-center gap-0.5">
                      <BadgeCheck
                        className="h-3.5 w-3.5 text-[var(--color-success)]"
                        aria-hidden="true"
                      />
                      {t("request.verified")}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          {form && (
            <p className="type-caption mt-3 text-[var(--color-muted-foreground)]">
              {t("request.railPromise", { hours: form.responseHours })}
            </p>
          )}
        </section>

        <section className={CARD}>
          <h2 className={CAPTION}>{t("request.railNextTitle")}</h2>
          <ol className="mt-3 grid list-none gap-3 p-0">
            {NEXT_STEPS.map(([titleKey, bodyKey], index) => (
              <li key={titleKey} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-xs font-bold text-[var(--color-primary)]"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="type-body-medium font-semibold">{t(titleKey)}</p>
                  <p className="type-caption text-[var(--color-muted-foreground)]">
                    {t(bodyKey)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <p className="type-caption text-[var(--color-muted-foreground)]">
          {t("request.railFooter")}
        </p>
      </aside>
    </div>
  );
}
