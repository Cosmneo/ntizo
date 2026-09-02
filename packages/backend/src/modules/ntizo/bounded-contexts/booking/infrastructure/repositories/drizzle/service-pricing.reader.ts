import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  service,
  serviceOption,
  serviceOptionTranslation,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { ServiceOptionUnnamedError } from "../../../domain/exceptions";
import type {
  ServiceOptionPricing,
  ServicePricingReaderPort,
} from "../../../app/ports/outbound/service-pricing.reader.port";

/**
 * `service_translation` and `service_option_translation` are joined twice
 * each — once on the caller's `locale`, once on `service.source_locale` —
 * because a customer's requested locale and the locale a service actually
 * has words in are two different facts, and only one query can compare them
 * without a second round trip. Aliased rather than reused: the same table
 * cannot be joined to itself twice under one name.
 */
const serviceTranslationRequested = alias(serviceTranslation, "service_translation_requested");
const serviceTranslationSource = alias(serviceTranslation, "service_translation_source");
const optionTranslationRequested = alias(serviceOptionTranslation, "service_option_translation_requested");
const optionTranslationSource = alias(serviceOptionTranslation, "service_option_translation_source");

/**
 * The single Drizzle query behind `ServicePricingReaderPort.findOption`.
 *
 * `service_option` is the driving table, inner-joined to `service` — a
 * `service_option` row cannot exist without its `service` (the FK says so),
 * so nothing is lost by requiring the join to match. Everything past that is
 * a `LEFT JOIN`: a missing translation must not turn a real option into no
 * row at all, or a customer reading the site in a locale nobody translated
 * into would be told the service does not exist.
 *
 * The option's own name is then the one thing this reader refuses on rather
 * than reports: four joins can find a row without finding a name for it, and
 * an option nobody named is one no booking can snapshot. See
 * `ServiceOptionUnnamedError` — and note that "no name" here means neither
 * translation matched, which is a *narrower* claim than "no name in any
 * locale": a name filed only under some third locale is invisible to these
 * joins and is refused with the rest. Widening that would mean picking a
 * language for the customer's receipt at random, which is worse than saying
 * the option is not describable.
 *
 * `bookingMode`, `serviceStatus`, `optionIsActive` and `pricingMode` are read
 * and returned as-is, unfiltered by this query — `CreateBookingCommand` is
 * what decides whether any of them refuse the booking, and it needs the real
 * values to say *which* refusal applies (see `ServiceOptionPricing`'s own
 * doc comment). Filtering here would collapse "an inactive option" and "no
 * such option" into the same null.
 */
export class DrizzleServicePricingReader implements ServicePricingReaderPort {
  async findOption(serviceOptionId: string, locale: string): Promise<ServiceOptionPricing | null> {
    const [row] = await getDb()
      .select({
        serviceId: service.id,
        providerId: service.providerId,
        // Read only so the refusal below can name the locale it looked in
        // second. A message saying "no name in pt-MZ or the source locale"
        // sends whoever reads it to find out which locale that is; naming it
        // sends them to the row.
        sourceLocale: service.sourceLocale,
        bookingMode: service.bookingMode,
        serviceStatus: service.status,
        optionIsActive: serviceOption.isActive,
        pricingMode: serviceOption.pricingMode,
        amountMinor: serviceOption.amountMinor,
        currency: serviceOption.currency,
        durationMinutes: serviceOption.durationMinutes,
        serviceNameRequested: serviceTranslationRequested.name,
        serviceNameSource: serviceTranslationSource.name,
        optionNameRequested: optionTranslationRequested.name,
        optionNameSource: optionTranslationSource.name,
      })
      .from(serviceOption)
      .innerJoin(service, eq(service.id, serviceOption.serviceId))
      .leftJoin(
        serviceTranslationRequested,
        and(
          eq(serviceTranslationRequested.serviceId, service.id),
          eq(serviceTranslationRequested.locale, locale),
        ),
      )
      .leftJoin(
        serviceTranslationSource,
        and(
          eq(serviceTranslationSource.serviceId, service.id),
          eq(serviceTranslationSource.locale, service.sourceLocale),
        ),
      )
      .leftJoin(
        optionTranslationRequested,
        and(
          eq(optionTranslationRequested.optionId, serviceOption.id),
          eq(optionTranslationRequested.locale, locale),
        ),
      )
      .leftJoin(
        optionTranslationSource,
        and(
          eq(optionTranslationSource.optionId, serviceOption.id),
          eq(optionTranslationSource.locale, service.sourceLocale),
        ),
      )
      .where(eq(serviceOption.id, serviceOptionId))
      .limit(1);

    if (!row) return null;

    // Requested locale first, source locale second — the same two-step
    // `serviceName` takes below, and the reason a missing translation is not
    // by itself a refusal: a customer reading in `fr-FR` on a service written
    // in `pt-MZ` gets the Portuguese name snapshotted, which is a real name
    // and the right one.
    //
    // Nothing left after both, though, and this reader has run out of places
    // to look. Trimmed for the test and not for the value: `"   "` is as
    // unusable a name as `""`, but what a booking snapshots is what the
    // catalogue actually holds — rewriting it here would make this reader the
    // author of a name it only read. Same split `BookingFieldBlankError`
    // makes, one layer down.
    const optionName = row.optionNameRequested ?? row.optionNameSource ?? "";
    if (optionName.trim().length === 0) {
      throw new ServiceOptionUnnamedError(serviceOptionId, locale, row.sourceLocale);
    }

    return {
      serviceId: row.serviceId,
      providerId: row.providerId,
      // Requested locale first, source locale second. Both can come back
      // null together only for a service with no source-locale translation
      // yet — a draft that has never been published, since `Service.publish`
      // enforces `hasSourceName` before anything can reach this query with
      // `serviceStatus: "published"`. `""` rather than throwing here: naming
      // that gap is `CreateBookingCommand`'s job (it already refuses any
      // service that is not published), not this reader's.
      //
      // The *option* has no equivalent rule behind it — `canPublish` never
      // asks whether an option is named — which is why the two fields are
      // treated differently a few lines up rather than symmetrically here.
      serviceName: row.serviceNameRequested ?? row.serviceNameSource ?? "",
      optionName,
      // Three `text` columns widened into unions. Only `pricingMode` has any
      // constraint behind it (`service_option_mode_fields`, and even that
      // constrains the mode's *companion* columns rather than its own value);
      // `service.status` and `service.booking_mode` carry no CHECK at all,
      // unlike `booking.status` or `review.status`. So these casts assert
      // something the database does not currently enforce.
      //
      // Safe anyway, because of how the values are used rather than how they
      // are typed: `CreateBookingCommand` compares them by equality against a
      // known-good value — `!== "priced"`, `!== "published"` — so any string
      // nobody expected refuses the booking rather than being mistaken for a
      // valid one. It fails closed. A union member added here without a
      // matching branch there would too.
      bookingMode: row.bookingMode as ServiceOptionPricing["bookingMode"],
      serviceStatus: row.serviceStatus as ServiceOptionPricing["serviceStatus"],
      optionIsActive: row.optionIsActive,
      pricingMode: row.pricingMode as ServiceOptionPricing["pricingMode"],
      amountMinor: row.amountMinor,
      currency: row.currency,
      durationMinutes: row.durationMinutes,
    };
  }
}
