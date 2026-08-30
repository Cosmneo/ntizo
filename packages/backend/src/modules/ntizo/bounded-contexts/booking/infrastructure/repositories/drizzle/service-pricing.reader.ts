import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  service,
  serviceOption,
  serviceOptionTranslation,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
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
      serviceName: row.serviceNameRequested ?? row.serviceNameSource ?? "",
      optionName: row.optionNameRequested ?? row.optionNameSource ?? "",
      // Kept honest by CHECK constraints on the columns they came from
      // (`service_option_mode_fields` for `pricingMode`); this cast names
      // that fact rather than re-validating it.
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
