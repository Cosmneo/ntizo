import type { ServiceOwnerDTO } from "@ntizo/shared/read-models";

export interface ServiceOwnerOptionTranslationRow {
  locale: string;
  name: string;
}

export interface ServiceOwnerOptionRow {
  id: string;
  pricingMode: string;
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  translations: ServiceOwnerOptionTranslationRow[];
}

export interface ServiceOwnerTranslationRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface ServiceOwnerQuoteFormRow {
  responseHours: number;
  askDeadline: boolean;
  askPhotos: boolean;
  askLocation: boolean;
  intro: string | null;
}

export interface ServiceOwnerRow {
  id: string;
  providerId: string;
  categoryId: string;
  categoryCode: string;
  sourceLocale: string;
  locationType: string;
  bookingMode: string;
  status: string;
  imageKeys: string[] | null;
  sortOrder: number;
  createdAt: Date;
  /** `provider_member.id`s who perform this service. */
  memberIds: string[];
  options: ServiceOwnerOptionRow[];
  translations: ServiceOwnerTranslationRow[];
  quoteForm: ServiceOwnerQuoteFormRow | null;
}

export interface ServicePublicOptionRow {
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  pricingMode: string;
}

export interface ServicePublicTranslationRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface ServicePublicRow {
  id: string;
  providerId: string;
  providerName: string;
  providerSlug: string;
  /** The provider's live status, joined rather than copied — see `listPublished`. */
  providerStatus: string;
  /** `individual` or `organization`, off the same joined row as the status. */
  providerType: string;
  categoryCode: string;
  /** Every language the category has a name in; the projection picks one. */
  categoryTranslations: ServicePublicTranslationRow[];
  status: string;
  sourceLocale: string;
  locationType: string;
  bookingMode: string;
  imageKeys: string[] | null;
  /** Null for a `quote` service, which carries no options at all. */
  defaultOption: ServicePublicOptionRow | null;
  /** The cheapest active option's amount, or null when there are none. */
  fromAmountMinor: number | null;
  /** How many active options the service carries. Decides "from" vs a flat price. */
  optionCount: number;
  translations: ServicePublicTranslationRow[];
}

export interface ServiceDetailOptionRow {
  id: string;
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  pricingMode: string;
  isDefault: boolean;
  translations: { locale: string; name: string }[];
}

export interface ServiceDetailRow extends ServicePublicRow {
  providerLogoKey: string | null;
  providerCity: string | null;
  providerDistrict: string | null;
  /** Active options only, cheapest first. */
  options: ServiceDetailOptionRow[];
  /** `provider_member.id`s who perform this service. */
  memberIds: string[];
}

export interface ListPublishedServicesFilter {
  categoryCode?: string | undefined;
  /** Scopes the page to one business's own services — a provider's public page, not the platform-wide browse. */
  providerId?: string | undefined;
  /** A `ServiceLocationType`. Absent means every kind. */
  locationType?: string | undefined;
  /**
   * A `ServicePaymentMode` — `fixed`, `hourly` or `quote`. Absent means every
   * kind.
   *
   * `quote` reads `service.bookingMode`. The other two are a property of the
   * service's default option, not of the service, so they are matched with an
   * EXISTS against `service_option` rather than a column — joining it would
   * multiply the rows `limit`/`offset` then page, the same trap the text
   * search avoids the same way.
   */
  paymentMode?: string | undefined;
  /** `individual` or `organization`. Absent means both. */
  providerType?: string | undefined;
  /**
   * A locale the service is *written in* — matched against
   * `service_translation`, not against anything the provider speaks.
   *
   * The distinction matters and the label on the filter has to carry it: a
   * listing translated into French says the listing is readable in French, and
   * nothing whatever about whether the person turning up speaks it.
   */
  language?: string | undefined;
  /**
   * Bounds on the *cheapest* active option, in minor units. Inclusive.
   *
   * The cheapest rather than the default, so the filter and the "from" price
   * the card prints are the same number. Filtering on the default would hide a
   * service whose 300 option is exactly what the reader asked for, because its
   * provider chose to lead with the 800 one.
   */
  minPriceMinor?: number | undefined;
  maxPriceMinor?: number | undefined;
  /**
   * Free text, already trimmed, matched against the service's name and
   * description in every language and against its provider's name. Absent
   * means no text search — an empty or blank string never reaches here.
   */
  q?: string | undefined;
  sort?: "default" | "newest" | "price" | undefined;
  limit: number;
  offset: number;
}

export interface ServiceReadRepositoryPort {
  /** Every service a provider owns, every option and every translation — the provider's own screen. */
  listForProvider(providerId: string, status: string | undefined): Promise<ServiceOwnerRow[]>;
  /**
   * Whether this person may act for this workspace.
   *
   * Mirrors `ServiceRepositoryPort.isProviderMember` on the write side rather
   * than reusing it: the read handler needs this from a read-tier port
   * because the kit's `argsMapper` is synchronous, so the membership check
   * has to run from the handler body against something the read module
   * already holds.
   */
  isProviderMember(providerId: string, userId: string): Promise<boolean>;
  /**
   * Published services with their provider's current status, category code,
   * default option and every translation — the customer's browse.
   *
   * `providerStatus` is read live off the `provider` row via a join, never
   * copied onto the service — a copied status is two statuses that can
   * disagree. The projection is the one that decides what "visible" means;
   * this method's job is only to hand over the material to decide it with.
   */
  listPublished(filter: ListPublishedServicesFilter): Promise<ServicePublicRow[]>;
  /**
   * How many published services of active providers match — before the page
   * size cuts in.
   *
   * Deliberately takes the filter *without* `limit`, `offset` or `sort`: none
   * of the three can change how many rows match, and accepting them invites an
   * implementation that applies one.
   */
  countPublished(
    filter: Omit<ListPublishedServicesFilter, "limit" | "offset" | "sort">,
  ): Promise<number>;
  /**
   * One service by id, in full — whatever its own status and whatever its
   * provider's, because this method does not look at either. It answers only
   * "does a service with this id exist", never "may an anonymous reader see
   * it". Null means exactly one thing: no such id.
   *
   * The published-AND-active gate lives one layer up, in
   * `GetServiceProjection` (`public/catalog/app/use-cases/get-service.projection.ts`),
   * not here — the same split `listPublished` above draws between handing
   * over material and deciding what "visible" means with it. Keeping the gate
   * out of this query means a fake, a future repository, or a forgotten WHERE
   * clause cannot leak an unpublished row past it; there is no filter here to
   * forget.
   */
  getPublishedById(id: string): Promise<ServiceDetailRow | null>;
}

export type { ServiceOwnerDTO };
