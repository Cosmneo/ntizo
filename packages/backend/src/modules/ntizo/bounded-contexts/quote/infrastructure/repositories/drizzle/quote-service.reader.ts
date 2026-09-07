import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  service,
  serviceMember,
  serviceQuoteForm,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import type {
  QuoteServiceReaderPort,
  QuoteServiceSnapshot,
} from "../../../app/ports/outbound/quote-service.reader.port";

// Two aliases of `service_translation`, the same trick `service-pricing.reader.ts`
// (Booking's own locale-fallback join) uses: one joined on the caller's
// `locale`, one on the service's own `source_locale`, so a single query can
// compare "what the customer asked for" against "what the provider actually
// wrote" without a second round trip.
const requested = alias(serviceTranslation, "quote_svc_tr_requested");
const source = alias(serviceTranslation, "quote_svc_tr_source");

/**
 * The single query behind `QuoteServiceReaderPort`.
 *
 * `service` drives; `provider` is inner-joined (a service cannot exist
 * without its provider). Everything past that is a `LEFT JOIN`: a missing
 * translation or a service with no quote form must not turn a real service
 * into no row at all — `RequestQuoteCommand` and `ProposeQuoteCommand`
 * decide what a missing form or an untranslated name means, not this
 * reader.
 *
 * `service_quote_form` is one row per service (its primary key is
 * `service_id`), so the left join cannot fan this query out — `quoteForm`
 * comes back `null` exactly when there is no such row, told apart from a
 * form of zeroes by checking `responseHours`, the one `NOT NULL` column on
 * that table.
 *
 * `service_member` fans out, so its rows are read in a second, narrow query
 * rather than joined into the first — joining it would multiply the single
 * service/translation/form row once per performer for no reason the caller
 * needs.
 */
export class DrizzleQuoteServiceReader implements QuoteServiceReaderPort {
  async findForQuote(serviceId: string, locale: string): Promise<QuoteServiceSnapshot | null> {
    const db = getDb();
    const [row] = await db
      .select({
        serviceId: service.id,
        providerId: service.providerId,
        providerStatus: provider.status,
        serviceStatus: service.status,
        bookingMode: service.bookingMode,
        locationType: service.locationType,
        requestedName: requested.name,
        sourceName: source.name,
        responseHours: serviceQuoteForm.responseHours,
        askDeadline: serviceQuoteForm.askDeadline,
        askPhotos: serviceQuoteForm.askPhotos,
        askLocation: serviceQuoteForm.askLocation,
        intro: serviceQuoteForm.intro,
      })
      .from(service)
      .innerJoin(provider, eq(provider.id, service.providerId))
      .leftJoin(requested, and(eq(requested.serviceId, service.id), eq(requested.locale, locale)))
      .leftJoin(source, and(eq(source.serviceId, service.id), eq(source.locale, service.sourceLocale)))
      .leftJoin(serviceQuoteForm, eq(serviceQuoteForm.serviceId, service.id))
      .where(eq(service.id, serviceId))
      .limit(1);
    if (!row) return null;

    const members = await db
      .select({ memberId: serviceMember.memberId })
      .from(serviceMember)
      .where(eq(serviceMember.serviceId, serviceId));

    return {
      serviceId: row.serviceId,
      providerId: row.providerId,
      providerStatus: row.providerStatus,
      serviceStatus: row.serviceStatus,
      bookingMode: row.bookingMode,
      locationType: row.locationType,
      // Requested locale first, source locale second — same two-step
      // `service-pricing.reader.ts` takes, and the same reason: a customer
      // reading in a locale nobody translated into still gets the name the
      // provider actually wrote, not an empty service.
      serviceName: row.requestedName ?? row.sourceName ?? "",
      quoteForm:
        row.responseHours === null
          ? null
          : {
              responseHours: row.responseHours,
              askDeadline: row.askDeadline ?? true,
              askPhotos: row.askPhotos ?? true,
              askLocation: row.askLocation ?? true,
              intro: row.intro ?? null,
            },
      memberIds: members.map((m) => m.memberId),
    };
  }
}
