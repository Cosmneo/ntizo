import { Service, type ServiceProps } from "../../../domain/aggregates/service.aggregate";

export interface ServiceRowSet {
  service: {
    id: string;
    providerId: string;
    categoryId: string;
    sourceLocale: string;
    locationType: string;
    bookingMode: string;
    status: string;
    imageKeys: string[] | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  };
  options: {
    id: string;
    serviceId: string;
    pricingMode: string;
    amountMinor: number;
    currency: string;
    durationMinutes: number | null;
    minMinutes: number | null;
    stepMinutes: number | null;
    isDefault: boolean;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[];
  translations: { serviceId: string; locale: string; name: string; description: string | null }[];
  optionTranslations: { optionId: string; locale: string; name: string }[];
  quoteForm: {
    serviceId: string;
    responseHours: number;
    askDeadline: boolean;
    askPhotos: boolean;
    askLocation: boolean;
    intro: string | null;
  } | null;
}

export const serviceMapper = {
  toDomain(rows: ServiceRowSet): Service {
    const props: ServiceProps = {
      id: rows.service.id,
      providerId: rows.service.providerId,
      categoryId: rows.service.categoryId,
      sourceLocale: rows.service.sourceLocale,
      locationType: rows.service.locationType,
      bookingMode: rows.service.bookingMode as ServiceProps["bookingMode"],
      status: rows.service.status as ServiceProps["status"],
      imageKeys: rows.service.imageKeys ?? [],
      sortOrder: rows.service.sortOrder,
      options: [...rows.options]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => ({
          id: o.id,
          pricingMode: o.pricingMode as "fixed" | "hourly",
          amountMinor: o.amountMinor,
          currency: o.currency,
          durationMinutes: o.durationMinutes,
          minMinutes: o.minMinutes,
          stepMinutes: o.stepMinutes,
          isDefault: o.isDefault,
          sortOrder: o.sortOrder,
          isActive: o.isActive,
          translations: rows.optionTranslations
            .filter((t) => t.optionId === o.id)
            .map((t) => ({ locale: t.locale, name: t.name })),
        })),
      translations: rows.translations.map((t) => ({
        locale: t.locale,
        name: t.name,
        description: t.description,
      })),
      quoteForm: rows.quoteForm
        ? {
            responseHours: rows.quoteForm.responseHours,
            askDeadline: rows.quoteForm.askDeadline,
            askPhotos: rows.quoteForm.askPhotos,
            askLocation: rows.quoteForm.askLocation,
            intro: rows.quoteForm.intro,
          }
        : null,
      createdAt: rows.service.createdAt,
      updatedAt: rows.service.updatedAt,
    };
    return Service.rehydrate(props);
  },

  toPersistence(service: Service): ServiceRowSet {
    const json = service.toJSON();
    return {
      service: {
        id: json.id,
        providerId: json.providerId,
        categoryId: json.categoryId,
        sourceLocale: json.sourceLocale,
        locationType: json.locationType,
        bookingMode: json.bookingMode,
        status: json.status,
        imageKeys: json.imageKeys,
        sortOrder: json.sortOrder,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      },
      options: json.options.map((o) => ({
        id: o.id,
        serviceId: json.id,
        pricingMode: o.pricingMode,
        amountMinor: o.amountMinor,
        currency: o.currency,
        durationMinutes: o.durationMinutes,
        minMinutes: o.minMinutes,
        stepMinutes: o.stepMinutes,
        isDefault: o.isDefault,
        sortOrder: o.sortOrder,
        isActive: o.isActive,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      })),
      translations: json.translations.map((t) => ({
        serviceId: json.id,
        locale: t.locale,
        name: t.name,
        description: t.description,
      })),
      optionTranslations: json.options.flatMap((o) =>
        o.translations.map((t) => ({ optionId: o.id, locale: t.locale, name: t.name })),
      ),
      quoteForm: json.quoteForm
        ? { serviceId: json.id, ...json.quoteForm }
        : null,
    };
  },
};
