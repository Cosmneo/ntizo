/**
 * Everything a command needs to know about the service a quote is about, in
 * one read. `RequestQuoteCommand` reads it in full — whether the service can
 * be quoted at all, whether it needs an address, and what its quote form
 * asks for — and `ProposeQuoteCommand` reads it again to check that the
 * member the provider named in `memberIds` may actually perform this
 * service.
 *
 * A snapshot rather than a `Service` aggregate loaded from the Provider
 * context: this context has no business instantiating another context's
 * aggregate, and both commands only ever read these fields — neither asks
 * the service to do anything. `findForQuote` still hands back a refusable
 * service's real values rather than refusing on its own, the same way
 * `QuoteServiceNotQuotableError`'s four reasons are decided by the command,
 * not by this port: a port that refuses silently would leave no reason for
 * the caller to report.
 */
export interface QuoteServiceSnapshot {
  serviceId: string;
  providerId: string;
  providerStatus: string;
  serviceStatus: string;
  bookingMode: string;
  locationType: string;
  /** In the requested locale, falling back to the service's source locale. */
  serviceName: string;
  quoteForm: {
    responseHours: number;
    askDeadline: boolean;
    askPhotos: boolean;
    askLocation: boolean;
    intro: string | null;
  } | null;
  /** `provider_member` ids that perform this service. */
  memberIds: string[];
}

export interface QuoteServiceReaderPort {
  /** Null means no such service; a refusable service comes back with its real values. */
  findForQuote(serviceId: string, locale: string): Promise<QuoteServiceSnapshot | null>;
}
