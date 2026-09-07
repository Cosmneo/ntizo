import { QuoteStatus } from "../../../../shared/infrastructure/database/quote/enums";
import type { QuoteExpiredCause, QuoteSupersededCause } from "../events";
import {
  QuoteAddressRequiredError,
  QuoteDateInvalidError,
  QuoteDurationInvalidError,
  QuoteFieldBlankError,
  QuoteNoLiveProposalError,
  QuoteNotOpenError,
  QuotePriceBelowMinimumError,
  QuotePriceInvalidError,
  QuoteProposalLapsedError,
  QuoteSnapshotInconsistentError,
  QuoteStartsInPastError,
  QuoteTransitionError,
} from "../exceptions";

export interface QuoteAddress {
  label: string;
  line: string;
  city: string;
  district: string | null;
  directions: string | null;
  lat: number | null;
  lng: number | null;
}

export interface QuoteProposalProps {
  readonly id: string | null;
  readonly priceMinor: number;
  readonly currency: string;
  readonly startsAt: Date;
  readonly durationMinutes: number;
  readonly endsAt: Date;
  readonly providerMemberId: string;
  readonly note: string | null;
  readonly validUntil: Date;
  readonly createdByUserId: string;
  readonly supersededAt: Date | null;
  readonly supersededCause: QuoteSupersededCause | null;
  readonly createdAt: Date;
}

export interface QuoteProps {
  readonly id: string | null;
  readonly serviceId: string;
  readonly providerId: string;
  readonly customerId: string;
  readonly threadId: string;
  readonly status: QuoteStatus;
  readonly expiresAt: Date | null;
  readonly locale: string;
  readonly description: string;
  /** `YYYY-MM-DD`, the customer's wish, advisory only. */
  readonly neededBy: string | null;
  readonly addressLabel: string | null;
  readonly addressLine: string | null;
  readonly addressCity: string | null;
  readonly addressDistrict: string | null;
  readonly addressDirections: string | null;
  readonly addressLat: number | null;
  readonly addressLng: number | null;
  readonly closedReason: string | null;
  readonly closedNote: string | null;
  readonly closedByUserId: string | null;
  readonly expiredCause: QuoteExpiredCause | null;
  readonly bookingId: string | null;
  readonly requestedAt: Date;
  readonly proposedAt: Date | null;
  readonly acceptedAt: Date | null;
  readonly declinedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly expiredAt: Date | null;
  /** Oldest first. At most one has `supersededAt === null`. */
  readonly proposals: readonly QuoteProposalProps[];
}

export interface ProposeInput {
  priceMinor: number;
  currency: string;
  startsAt: Date;
  durationMinutes: number;
  providerMemberId: string;
  note?: string | null;
  validUntil: Date;
  createdByUserId: string;
  at: Date;
  minPriceMinor: number;
}

const OPEN_STATUSES: readonly QuoteStatus[] = [QuoteStatus.Requested, QuoteStatus.Proposed];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class Quote {
  private constructor(private readonly props: QuoteProps) {}

  private static requireNonBlank(value: string, field: string): void {
    if (value.trim().length === 0) throw new QuoteFieldBlankError(field);
  }

  private static requireValidDate(value: Date, field: string): void {
    if (Number.isNaN(value.getTime())) throw new QuoteDateInvalidError(field);
  }

  private static requireAddress(address: QuoteAddress): void {
    Quote.requireNonBlank(address.label, "addressLabel");
    Quote.requireNonBlank(address.line, "addressLine");
    Quote.requireNonBlank(address.city, "addressCity");
    if (address.district != null) Quote.requireNonBlank(address.district, "addressDistrict");
    if (address.directions != null) Quote.requireNonBlank(address.directions, "addressDirections");
  }

  static request(input: {
    id?: string | null;
    serviceId: string;
    providerId: string;
    customerId: string;
    threadId: string;
    locale: string;
    description: string;
    neededBy?: string | null;
    address?: QuoteAddress | null;
    at: Date;
    respondBy: Date;
  }): Quote {
    Quote.requireNonBlank(input.serviceId, "serviceId");
    Quote.requireNonBlank(input.providerId, "providerId");
    Quote.requireNonBlank(input.customerId, "customerId");
    Quote.requireNonBlank(input.threadId, "threadId");
    Quote.requireNonBlank(input.locale, "locale");
    const description = input.description.trim();
    if (description.length === 0) throw new QuoteFieldBlankError("description");
    Quote.requireValidDate(input.at, "at");
    Quote.requireValidDate(input.respondBy, "respondBy");
    if (input.respondBy.getTime() <= input.at.getTime()) throw new QuoteDateInvalidError("respondBy");
    if (input.neededBy != null && !ISO_DATE.test(input.neededBy)) throw new QuoteDateInvalidError("neededBy");
    const address = input.address ?? null;
    if (address) Quote.requireAddress(address);

    return new Quote({
      id: input.id ?? null,
      serviceId: input.serviceId,
      providerId: input.providerId,
      customerId: input.customerId,
      threadId: input.threadId,
      status: QuoteStatus.Requested,
      expiresAt: input.respondBy,
      locale: input.locale,
      description,
      neededBy: input.neededBy ?? null,
      addressLabel: address?.label ?? null,
      addressLine: address?.line ?? null,
      addressCity: address?.city ?? null,
      addressDistrict: address?.district ?? null,
      addressDirections: address?.directions ?? null,
      addressLat: address?.lat ?? null,
      addressLng: address?.lng ?? null,
      closedReason: null,
      closedNote: null,
      closedByUserId: null,
      expiredCause: null,
      bookingId: null,
      requestedAt: input.at,
      proposedAt: null,
      acceptedAt: null,
      declinedAt: null,
      rejectedAt: null,
      withdrawnAt: null,
      expiredAt: null,
      proposals: [],
    });
  }

  /**
   * Reconstitution from storage. Re-runs the same non-blank guards `request`
   * does and re-checks each proposal's derived `endsAt`, but not the
   * transition-level checks `request` makes: a restored quote may
   * legitimately be terminal, with `expiresAt` null and the closed fields
   * set, and `respondBy > requestedAt` has no meaning for it.
   */
  static restore(props: QuoteProps): Quote {
    Quote.requireNonBlank(props.serviceId, "serviceId");
    Quote.requireNonBlank(props.providerId, "providerId");
    Quote.requireNonBlank(props.customerId, "customerId");
    Quote.requireNonBlank(props.threadId, "threadId");
    Quote.requireNonBlank(props.locale, "locale");
    Quote.requireNonBlank(props.description, "description");

    for (const field of ["addressLabel", "addressLine", "addressCity"] as const) {
      const value = props[field];
      if (value != null) Quote.requireNonBlank(value, field);
    }
    if (props.addressDistrict != null) Quote.requireNonBlank(props.addressDistrict, "addressDistrict");
    if (props.addressDirections != null) Quote.requireNonBlank(props.addressDirections, "addressDirections");

    for (const p of props.proposals) {
      const expectedEnd = new Date(p.startsAt.getTime() + p.durationMinutes * 60_000);
      if (p.endsAt.getTime() !== expectedEnd.getTime()) {
        throw new QuoteSnapshotInconsistentError("proposal.endsAt", p.endsAt.toISOString(), expectedEnd.toISOString());
      }
    }
    const liveCount = props.proposals.filter((p) => p.supersededAt === null).length;
    if (liveCount > 1) {
      throw new QuoteSnapshotInconsistentError("liveProposalCount", liveCount, "at most one live proposal");
    }
    return new Quote({ ...props, proposals: [...props.proposals] });
  }

  get liveProposal(): QuoteProposalProps | null {
    return this.props.proposals.find((p) => p.supersededAt === null) ?? null;
  }

  hasCompleteAddress(): boolean {
    return this.props.addressLabel !== null && this.props.addressLine !== null && this.props.addressCity !== null;
  }

  private requireOpen(to: QuoteStatus): void {
    if (!OPEN_STATUSES.includes(this.props.status)) throw new QuoteTransitionError(this.props.status, to);
  }

  propose(input: ProposeInput): Quote {
    this.requireOpen(QuoteStatus.Proposed);
    Quote.requireValidDate(input.at, "at");
    Quote.requireValidDate(input.startsAt, "startsAt");
    Quote.requireValidDate(input.validUntil, "validUntil");
    Quote.requireNonBlank(input.providerMemberId, "providerMemberId");
    Quote.requireNonBlank(input.createdByUserId, "createdByUserId");
    Quote.requireNonBlank(input.currency, "currency");
    if (!Number.isInteger(input.priceMinor) || input.priceMinor <= 0) {
      throw new QuotePriceInvalidError(input.priceMinor);
    }
    if (input.priceMinor < input.minPriceMinor) {
      throw new QuotePriceBelowMinimumError(input.priceMinor, input.minPriceMinor);
    }
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
      throw new QuoteDurationInvalidError(input.durationMinutes);
    }
    if (input.startsAt.getTime() <= input.at.getTime()) throw new QuoteStartsInPastError(input.startsAt);
    if (input.validUntil.getTime() <= input.at.getTime()) throw new QuoteDateInvalidError("validUntil");

    const note = (input.note ?? "").trim();
    const superseded = this.props.proposals.map((p) =>
      p.supersededAt === null ? { ...p, supersededAt: input.at, supersededCause: "revised" as const } : p,
    );
    const fresh: QuoteProposalProps = {
      id: null,
      priceMinor: input.priceMinor,
      currency: input.currency,
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      endsAt: new Date(input.startsAt.getTime() + input.durationMinutes * 60_000),
      providerMemberId: input.providerMemberId,
      note: note.length === 0 ? null : note,
      validUntil: input.validUntil,
      createdByUserId: input.createdByUserId,
      supersededAt: null,
      supersededCause: null,
      createdAt: input.at,
    };
    return new Quote({
      ...this.props,
      status: QuoteStatus.Proposed,
      expiresAt: input.validUntil,
      proposedAt: input.at,
      proposals: [...superseded, fresh],
    });
  }

  /** Supplies the address at acceptance when the request did not ask for one. Only while open. */
  withAddress(address: QuoteAddress): Quote {
    if (!OPEN_STATUSES.includes(this.props.status)) throw new QuoteNotOpenError();
    Quote.requireAddress(address);
    return new Quote({
      ...this.props,
      addressLabel: address.label,
      addressLine: address.line,
      addressCity: address.city,
      addressDistrict: address.district,
      addressDirections: address.directions,
      addressLat: address.lat,
      addressLng: address.lng,
    });
  }

  accept(at: Date, bookingId: string): Quote {
    if (this.props.status !== QuoteStatus.Proposed) throw new QuoteTransitionError(this.props.status, QuoteStatus.Accepted);
    Quote.requireValidDate(at, "at");
    Quote.requireNonBlank(bookingId, "bookingId");
    const live = this.liveProposal;
    if (!live) throw new QuoteNoLiveProposalError();
    if (live.validUntil.getTime() <= at.getTime()) throw new QuoteProposalLapsedError(live.validUntil);
    if (!this.hasCompleteAddress()) throw new QuoteAddressRequiredError();
    return new Quote({ ...this.props, status: QuoteStatus.Accepted, acceptedAt: at, bookingId, expiresAt: null });
  }

  private close(at: Date, byUserId: string, reason: string, note: string | null, patch: Partial<QuoteProps>): Quote {
    Quote.requireValidDate(at, "at");
    Quote.requireNonBlank(byUserId, "byUserId");
    Quote.requireNonBlank(reason, "reason");
    const trimmed = (note ?? "").trim();
    return new Quote({
      ...this.props,
      expiresAt: null,
      closedReason: reason,
      closedNote: trimmed.length === 0 ? null : trimmed,
      closedByUserId: byUserId,
      ...patch,
    });
  }

  /** The provider says no, from REQUESTED (declines the request) or PROPOSED (withdraws the proposal). */
  decline(at: Date, byUserId: string, reason: string, note: string | null): Quote {
    this.requireOpen(QuoteStatus.Declined);
    return this.close(at, byUserId, reason, note, { status: QuoteStatus.Declined, declinedAt: at });
  }

  /** The customer refuses the proposal. */
  reject(at: Date, byUserId: string, reason: string, note: string | null): Quote {
    if (this.props.status !== QuoteStatus.Proposed) throw new QuoteTransitionError(this.props.status, QuoteStatus.Rejected);
    return this.close(at, byUserId, reason, note, { status: QuoteStatus.Rejected, rejectedAt: at });
  }

  /** The customer takes the request back before any proposal. */
  withdraw(at: Date, byUserId: string, note: string | null): Quote {
    if (this.props.status !== QuoteStatus.Requested) throw new QuoteTransitionError(this.props.status, QuoteStatus.Withdrawn);
    return this.close(at, byUserId, "withdrawn", note, { status: QuoteStatus.Withdrawn, withdrawnAt: at });
  }

  /** A clock ran out. No-op from any status that has no clock, so the sweep is idempotent. */
  expire(at: Date): Quote {
    if (!OPEN_STATUSES.includes(this.props.status)) return this;
    Quote.requireValidDate(at, "at");
    const cause: QuoteExpiredCause =
      this.props.status === QuoteStatus.Requested ? "provider_did_not_respond" : "proposal_lapsed";
    return new Quote({ ...this.props, status: QuoteStatus.Expired, expiredAt: at, expiredCause: cause, expiresAt: null });
  }

  /** The calendar refused the proposed time at acceptance: back to the provider, with a fresh response clock. */
  proposalStale(at: Date, respondBy: Date): Quote {
    if (this.props.status !== QuoteStatus.Proposed) throw new QuoteTransitionError(this.props.status, QuoteStatus.Requested);
    Quote.requireValidDate(at, "at");
    Quote.requireValidDate(respondBy, "respondBy");
    const proposals = this.props.proposals.map((p) =>
      p.supersededAt === null ? { ...p, supersededAt: at, supersededCause: "slot_taken" as const } : p,
    );
    return new Quote({ ...this.props, status: QuoteStatus.Requested, expiresAt: respondBy, proposals });
  }

  get id(): string | null { return this.props.id; }
  get serviceId(): string { return this.props.serviceId; }
  get providerId(): string { return this.props.providerId; }
  get customerId(): string { return this.props.customerId; }
  get threadId(): string { return this.props.threadId; }
  get status(): QuoteStatus { return this.props.status; }
  get expiresAt(): Date | null { return this.props.expiresAt; }
  get locale(): string { return this.props.locale; }
  get description(): string { return this.props.description; }
  get neededBy(): string | null { return this.props.neededBy; }
  get addressLabel(): string | null { return this.props.addressLabel; }
  get addressLine(): string | null { return this.props.addressLine; }
  get addressCity(): string | null { return this.props.addressCity; }
  get addressDistrict(): string | null { return this.props.addressDistrict; }
  get addressDirections(): string | null { return this.props.addressDirections; }
  get addressLat(): number | null { return this.props.addressLat; }
  get addressLng(): number | null { return this.props.addressLng; }
  get closedReason(): string | null { return this.props.closedReason; }
  get closedNote(): string | null { return this.props.closedNote; }
  get closedByUserId(): string | null { return this.props.closedByUserId; }
  get expiredCause(): QuoteExpiredCause | null { return this.props.expiredCause; }
  get bookingId(): string | null { return this.props.bookingId; }
  get requestedAt(): Date { return this.props.requestedAt; }
  get proposedAt(): Date | null { return this.props.proposedAt; }
  get acceptedAt(): Date | null { return this.props.acceptedAt; }
  get declinedAt(): Date | null { return this.props.declinedAt; }
  get rejectedAt(): Date | null { return this.props.rejectedAt; }
  get withdrawnAt(): Date | null { return this.props.withdrawnAt; }
  get expiredAt(): Date | null { return this.props.expiredAt; }
  get proposals(): readonly QuoteProposalProps[] { return this.props.proposals; }
  /** Everything, for the repository. */
  toProps(): QuoteProps { return { ...this.props, proposals: [...this.props.proposals] }; }
}
