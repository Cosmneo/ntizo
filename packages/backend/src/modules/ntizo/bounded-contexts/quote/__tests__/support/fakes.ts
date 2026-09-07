import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import { Quote, type QuoteAddress } from "../../domain/aggregates/quote.aggregate";
import type { QuoteRepositoryPort } from "../../app/ports/outbound/quote.repository.port";
import type {
  NewQuoteAttachment,
  QuoteAttachmentRepositoryPort,
} from "../../app/ports/outbound/quote-attachment.repository.port";
import type { QuoteServiceReaderPort, QuoteServiceSnapshot } from "../../app/ports/outbound/quote-service.reader.port";
import type { ProviderMemberReaderPort } from "../../app/ports/outbound/provider-member.reader.port";
import type { CustomerPhoneReaderPort } from "../../app/ports/outbound/customer-phone.reader.port";
import type { PlatformSettingsReaderPort } from "../../app/ports/outbound/platform-settings.reader.port";
import type { SlotOverlapReaderPort } from "../../app/ports/outbound/slot-overlap.reader.port";
import type { AttachmentStoragePort, StoredAttachmentMetadata } from "../../app/ports/outbound/attachment-storage.port";
import type { StartThreadPort } from "../../app/ports/outbound/start-thread.port";
import type { BookingOpenerPort, OpenBookingFromQuoteInput } from "../../app/ports/outbound/booking-opener.port";
import type { RaiseNotificationInput, RaiseNotificationInternalPort } from "../../app/ports/outbound/raise-notification.port";

export const NOW = new Date("2026-09-07T10:00:00Z");
export const IN_48H = new Date(NOW.getTime() + 48 * 3_600_000);
export const NEXT_WEEK = new Date(NOW.getTime() + 7 * 24 * 3_600_000);

export const ADDRESS: QuoteAddress = {
  label: "Casa",
  line: "Av. Julius Nyerere 1234",
  city: "Maputo",
  district: "Bairro Central",
  directions: null,
  lat: null,
  lng: null,
};

/**
 * A transactional fake with real buffer-and-discard semantics, not a
 * passthrough. `stage(commit)` is how a fake repository or outbox registers a
 * write instead of applying it straight to its own arrays: called while
 * `atomicExecute`'s block is running, the write is buffered and only applied
 * once that block returns without throwing; a throw discards the whole
 * buffer instead. Called with no block open, it applies immediately — the
 * same way a bare `INSERT` against a real database autocommits unless
 * something wrapped it in `BEGIN … COMMIT`.
 *
 * Modelled on Booking's own `TrackingUnitOfWork`
 * (`booking/__tests__/support/fakes.ts`) — same buffering, same `order` log
 * for a capturing outbox or opener to tell "happened inside the transaction,
 * after the write it depends on" apart from "happened outside it, or before
 * that write."
 */
export class TrackingUnitOfWork implements UnitOfWorkPort {
  public insideTransaction = false;
  public order: string[] = [];
  private pending: Array<() => void> = [];

  stage(commit: () => void): void {
    if (this.insideTransaction) this.pending.push(commit);
    else commit();
  }

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    this.insideTransaction = true;
    try {
      const result = await work();
      for (const commit of this.pending) commit();
      return result;
    } finally {
      this.pending = [];
      this.insideTransaction = false;
    }
  }
}

/** Records every event a command published, alongside whether it was staged inside the transaction. */
export class CapturingOutbox implements OutboxPort {
  published: { events: BaseDomainEvent[]; aggregateType: string; insideTransaction: boolean }[] = [];

  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}

  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    const record = { events, aggregateType, insideTransaction: this.unitOfWork.insideTransaction };
    this.unitOfWork.stage(() => this.published.push(record));
  }
}

/**
 * Records every notification a command raised, in order, so a test can read
 * back *what* was announced rather than only that something was.
 *
 * `failWith` is the other half, and the reason this fake takes a constructor
 * argument at all: BR-Q10 says a raise that throws must not fail the write
 * that already committed, and the only way to prove that is a port that
 * really does throw. `insideTransactionAtCall` is the witness for that same
 * rule's other half, recorded at the moment of the call because nothing
 * observable afterwards can answer the question — `TrackingUnitOfWork`
 * clears `insideTransaction` in its `finally`, so by the time a test body
 * runs, a raise made from inside the transaction and one made after it read
 * exactly alike. Only populated when a `unitOfWork` is passed.
 */
export class FakeRaiser implements RaiseNotificationInternalPort {
  public readonly raised: RaiseNotificationInput[] = [];
  public readonly insideTransactionAtCall: boolean[] = [];

  constructor(
    private readonly failWith: Error | null = null,
    private readonly unitOfWork?: TrackingUnitOfWork,
  ) {}

  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    if (this.unitOfWork) this.insideTransactionAtCall.push(this.unitOfWork.insideTransaction);
    if (this.failWith) throw this.failWith;
    this.raised.push(input);
    return { notificationId: `n-${this.raised.length}` };
  }
}

/**
 * Stands in for what a real `QuoteRepositoryPort.insert`/`save` does: hand
 * back the same quote with a database-assigned id. Built through
 * `Quote.restore`, the same reconstitution seam the real repository uses,
 * rather than reaching into `Quote`'s private state.
 */
export function withId(quote: Quote, id: string): Quote {
  return Quote.restore({ ...quote.toProps(), id });
}

export function requestedQuote(over: Partial<Parameters<typeof Quote.request>[0]> = {}): Quote {
  return Quote.request({
    id: "q-1",
    serviceId: "svc-1",
    providerId: "prov-1",
    customerId: "cust-1",
    threadId: "thr-1",
    locale: "pt-MZ",
    description: "Dois aparelhos split",
    neededBy: "2026-09-27",
    address: ADDRESS,
    at: NOW,
    respondBy: IN_48H,
    ...over,
  });
}

export function proposedQuote(over: Partial<Parameters<typeof Quote.request>[0]> = {}): Quote {
  const proposed = requestedQuote(over).propose({
    priceMinor: 9_800,
    currency: "MZN",
    startsAt: NEXT_WEEK,
    durationMinutes: 240,
    providerMemberId: "mem-1",
    note: "Inclui tubagem",
    validUntil: new Date(NOW.getTime() + 72 * 3_600_000),
    createdByUserId: "user-right-1",
    at: NOW,
    minPriceMinor: 5_000,
  });
  // Give the live proposal an id, as the repository would after a save.
  const props = proposed.toProps();
  return Quote.restore({ ...props, proposals: props.proposals.map((p, i) => ({ ...p, id: p.id ?? `prop-${i + 1}` })) });
}

/**
 * A proposed quote whose live proposal has already lapsed.
 *
 * Built through `restore` with a `validUntil` one second in the past, rather
 * than relying on the wall clock: a test that only starts asserting on a
 * particular date is worse than one that fails today.
 */
export function lapsedProposedQuote(over: Partial<Parameters<typeof Quote.request>[0]> = {}): Quote {
  const props = proposedQuote(over).toProps();
  return Quote.restore({
    ...props,
    proposals: props.proposals.map((p) =>
      p.supersededAt === null ? { ...p, validUntil: new Date(Date.now() - 1_000) } : p,
    ),
  });
}

export class FakeQuoteRepo implements QuoteRepositoryPort {
  public inserted: Quote[] = [];
  public saveCalls = 0;
  public savedArg: Quote | null = null;
  public currentStatusOverride: Quote["status"] | null = null;
  public insertError: Error | null = null;
  private current: Quote | null;

  constructor(initial: Quote | null, private readonly unitOfWork?: TrackingUnitOfWork) {
    this.current = initial;
  }

  get state(): Quote | null {
    return this.current;
  }

  async insert(quote: Quote): Promise<Quote> {
    if (this.insertError) throw this.insertError;
    const saved = withId(quote, `q-${this.inserted.length + 1}`);
    this.inserted.push(saved);
    this.unitOfWork?.order.push("insert");
    this.current = saved;
    return saved;
  }

  async findById(id: string): Promise<Quote | null> {
    return this.current?.id === id ? this.current : null;
  }

  /**
   * Assigns `prop-1`, `prop-2` … to proposals whose id is null — the shape
   * the real repository's insert-new/supersede-the-rest write produces —
   * so a test can assert a new proposal comes back with the id the
   * repository would have given it.
   */
  async save(quote: Quote, expectedStatus: Quote["status"]): Promise<Quote | null> {
    this.saveCalls += 1;
    this.savedArg = quote;
    this.unitOfWork?.order.push("save");
    const actual = this.currentStatusOverride ?? this.current?.status;
    if (actual !== expectedStatus) return null;
    const props = quote.toProps();
    const persisted = Quote.restore({
      ...props,
      proposals: props.proposals.map((p, i) => ({ ...p, id: p.id ?? `prop-${i + 1}` })),
    });
    const commit = () => {
      this.current = persisted;
    };
    if (this.unitOfWork) this.unitOfWork.stage(commit);
    else commit();
    return persisted;
  }

  async findDueForSweep(): Promise<Quote[]> {
    return this.current ? [this.current] : [];
  }
}

export class FakeAttachmentRepo implements QuoteAttachmentRepositoryPort {
  public rows: NewQuoteAttachment[] = [];

  constructor(private readonly unitOfWork?: TrackingUnitOfWork) {}

  async insertMany(rows: NewQuoteAttachment[]): Promise<void> {
    this.unitOfWork?.order.push("attachments");
    this.rows.push(...rows);
  }

  async findVisible(): Promise<null> {
    return null;
  }

  async findAny(): Promise<null> {
    return null;
  }
}

export function serviceSnapshot(over: Partial<QuoteServiceSnapshot> = {}): QuoteServiceSnapshot {
  return {
    serviceId: "svc-1",
    providerId: "prov-1",
    providerStatus: "active",
    serviceStatus: "published",
    bookingMode: "quote",
    locationType: "at_customer",
    serviceName: "Instalação de ar condicionado",
    quoteForm: { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: true, intro: null },
    memberIds: ["mem-1", "mem-2"],
    ...over,
  };
}

export class FakeServiceReader implements QuoteServiceReaderPort {
  public calls: { serviceId: string; locale: string }[] = [];

  constructor(private readonly snapshot: QuoteServiceSnapshot | null = serviceSnapshot()) {}

  async findForQuote(serviceId: string, locale: string): Promise<QuoteServiceSnapshot | null> {
    this.calls.push({ serviceId, locale });
    return this.snapshot;
  }
}

/** prov-1 has user-right-1 and user-right-2; user-wrong belongs to prov-2. */
export class FakeMemberReader implements ProviderMemberReaderPort {
  public queries: { providerId: string; userId: string }[] = [];

  async isMember(providerId: string, userId: string): Promise<boolean> {
    this.queries.push({ providerId, userId });
    return providerId === "prov-1" && (userId === "user-right-1" || userId === "user-right-2");
  }
}

export class FakePhoneReader implements CustomerPhoneReaderPort {
  constructor(private readonly phones: Record<string, string | null> = { "cust-1": "258841234021" }) {}

  async findPhoneNumber(userId: string): Promise<string | null> {
    return this.phones[userId] ?? null;
  }
}

export class FakeSettings implements PlatformSettingsReaderPort {
  constructor(
    public validityHours = 72,
    public minPriceMinor = 5_000,
  ) {}

  async findQuoteProposalValidityHours(): Promise<number> {
    return this.validityHours;
  }

  async findMinServicePriceMinor(): Promise<number> {
    return this.minPriceMinor;
  }
}

export class FakeOverlap implements SlotOverlapReaderPort {
  public calls: { providerMemberId: string; startsAt: Date; endsAt: Date }[] = [];

  constructor(private readonly answer = false) {}

  async overlaps(input: { providerMemberId: string; startsAt: Date; endsAt: Date }): Promise<boolean> {
    this.calls.push(input);
    return this.answer;
  }
}

export class FakeStorage implements AttachmentStoragePort {
  constructor(private readonly objects: Record<string, StoredAttachmentMetadata> = {}) {}

  async head(storageKey: string): Promise<StoredAttachmentMetadata | null> {
    return this.objects[storageKey] ?? null;
  }
}

export function storedPhoto(uploadedByUserId: string): StoredAttachmentMetadata {
  return { contentType: "image/jpeg", sizeBytes: 120_000, uploadedByUserId, originalName: "parede.jpg" };
}

export class FakeStartThread implements StartThreadPort {
  public calls: { customerUserId: string; providerId: string }[] = [];

  async execute(input: { customerUserId: string; providerId: string }): Promise<{ threadId: string }> {
    this.calls.push(input);
    return { threadId: "thr-1" };
  }
}

export class FakeBookingOpener implements BookingOpenerPort {
  public calls: OpenBookingFromQuoteInput[] = [];

  constructor(
    private readonly failWith: Error | null = null,
    private readonly unitOfWork?: TrackingUnitOfWork,
  ) {}

  async openFromQuote(input: OpenBookingFromQuoteInput): Promise<{ bookingId: string; payBy: Date }> {
    this.calls.push(input);
    this.unitOfWork?.order.push("openBooking");
    if (this.failWith) throw this.failWith;
    return { bookingId: "bk-1", payBy: new Date(NOW.getTime() + 15 * 60_000) };
  }
}
