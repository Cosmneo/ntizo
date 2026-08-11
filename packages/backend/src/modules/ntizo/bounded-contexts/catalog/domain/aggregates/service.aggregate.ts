import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import {
  assertOptionShape,
  canPublish,
  promoteNextDefault,
  withSingleDefault,
} from "../service-rules";
import { LastOptionError, QuoteServiceHasOptionsError } from "../exceptions";
import {
  ServiceCreated,
  ServicePublished,
  ServiceUnpublished,
  ServiceUpdated,
} from "../events";

export interface ServiceOptionProps {
  id: string;
  pricingMode: "fixed" | "hourly";
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  /** Per-locale names, the source locale among them. */
  translations: { locale: string; name: string }[];
}

export interface ServiceTranslationProps {
  locale: string;
  name: string;
  description: string | null;
}

export interface QuoteFormProps {
  responseHours: number;
  askDeadline: boolean;
  askPhotos: boolean;
  askLocation: boolean;
  intro: string | null;
}

export interface ServiceProps {
  id: string;
  providerId: string;
  categoryId: string;
  sourceLocale: string;
  locationType: string;
  bookingMode: "priced" | "quote";
  status: "draft" | "published" | "archived";
  imageKeys: string[];
  sortOrder: number;
  options: ServiceOptionProps[];
  translations: ServiceTranslationProps[];
  quoteForm: QuoteFormProps | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Service {
  private readonly _events: BaseDomainEvent[] = [];

  private constructor(private readonly props: ServiceProps) {}

  static rehydrate(props: ServiceProps): Service {
    return new Service(props);
  }

  static create(params: {
    id: string;
    providerId: string;
    categoryId: string;
    sourceLocale: string;
    locationType: string;
    bookingMode: "priced" | "quote";
    name: string;
    description?: string | null;
  }): Service {
    const now = new Date();
    const service = new Service({
      id: params.id,
      providerId: params.providerId,
      categoryId: params.categoryId,
      sourceLocale: params.sourceLocale,
      locationType: params.locationType,
      bookingMode: params.bookingMode,
      // A draft, not a listing. The provider decides when it goes up.
      status: "draft",
      imageKeys: [],
      sortOrder: 0,
      options: [],
      // The name they typed, in the language they typed it. This row is what
      // every other locale falls back to, and it is why the provider never
      // sees a translation form unless they go looking for one.
      translations: [
        { locale: params.sourceLocale, name: params.name, description: params.description ?? null },
      ],
      quoteForm:
        params.bookingMode === "quote"
          ? { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: true, intro: null }
          : null,
      createdAt: now,
      updatedAt: now,
    });
    service._events.push(
      new ServiceCreated({ serviceId: params.id, providerId: params.providerId }),
    );
    return service;
  }

  get id() { return this.props.id; }
  get providerId() { return this.props.providerId; }
  get status() { return this.props.status; }

  update(params: {
    categoryId?: string;
    locationType?: string;
    imageKeys?: string[];
    sortOrder?: number;
  }): void {
    if (params.categoryId !== undefined) this.props.categoryId = params.categoryId;
    if (params.locationType !== undefined) this.props.locationType = params.locationType;
    if (params.imageKeys !== undefined) this.props.imageKeys = params.imageKeys;
    if (params.sortOrder !== undefined) this.props.sortOrder = params.sortOrder;
    this.touch();
  }

  addOption(params: {
    id: string;
    pricingMode: "fixed" | "hourly";
    amountMinor: number;
    currency: string;
    durationMinutes: number | null;
    minMinutes: number | null;
    stepMinutes: number | null;
    name: string;
  }): void {
    if (this.props.bookingMode === "quote") throw new QuoteServiceHasOptionsError();
    assertOptionShape(params);

    this.props.options.push({
      id: params.id,
      pricingMode: params.pricingMode,
      amountMinor: params.amountMinor,
      currency: params.currency,
      durationMinutes: params.durationMinutes,
      minMinutes: params.minMinutes,
      stepMinutes: params.stepMinutes,
      isDefault: false,
      sortOrder: this.nextSortOrder(),
      isActive: true,
      translations: [{ locale: this.props.sourceLocale, name: params.name }],
    });
    this.normaliseDefaults();
    this.touch();
  }

  updateOption(
    optionId: string,
    params: Partial<Omit<ServiceOptionProps, "id" | "translations">> & { name?: string },
  ): void {
    const option = this.props.options.find((o) => o.id === optionId);
    if (!option) return;

    const next = {
      pricingMode: params.pricingMode ?? option.pricingMode,
      amountMinor: params.amountMinor ?? option.amountMinor,
      durationMinutes:
        params.durationMinutes !== undefined ? params.durationMinutes : option.durationMinutes,
      minMinutes: params.minMinutes !== undefined ? params.minMinutes : option.minMinutes,
      stepMinutes: params.stepMinutes !== undefined ? params.stepMinutes : option.stepMinutes,
    };
    assertOptionShape(next);

    Object.assign(option, next);
    if (params.currency !== undefined) option.currency = params.currency;
    if (params.isActive !== undefined) option.isActive = params.isActive;
    if (params.isDefault === true) {
      for (const o of this.props.options) o.isDefault = o.id === optionId;
    }
    if (params.name !== undefined) {
      this.setOptionTranslation(optionId, this.props.sourceLocale, params.name);
    }
    this.normaliseDefaults();
    this.touch();
  }

  removeOption(optionId: string): void {
    // A draft may be emptied — somebody is still working. A published service
    // may not: it is on the marketplace with nothing to buy.
    if (this.props.status === "published" && this.props.options.length <= 1) {
      throw new LastOptionError();
    }
    const kept = promoteNextDefault(this.props.options, optionId);
    this.props.options = kept as ServiceOptionProps[];
    this.touch();
  }

  reorderOptions(orderedIds: readonly string[]): void {
    const byId = new Map(this.props.options.map((o) => [o.id, o]));
    const next = orderedIds.flatMap((id, i) => {
      const found = byId.get(id);
      return found ? [{ ...found, sortOrder: i }] : [];
    });
    // Anything the caller did not mention keeps its place at the end rather
    // than disappearing: a stale list must not delete rows.
    const mentioned = new Set(orderedIds);
    const rest = this.props.options
      .filter((o) => !mentioned.has(o.id))
      .map((o, i) => ({ ...o, sortOrder: next.length + i }));
    this.props.options = [...next, ...rest];
    this.normaliseDefaults();
    this.touch();
  }

  setOptionTranslation(optionId: string, locale: string, name: string): void {
    const option = this.props.options.find((o) => o.id === optionId);
    if (!option) return;
    const existing = option.translations.find((t) => t.locale === locale);
    if (existing) existing.name = name;
    else option.translations.push({ locale, name });
    this.touch();
  }

  setTranslation(locale: string, name: string, description: string | null): void {
    const existing = this.props.translations.find((t) => t.locale === locale);
    if (existing) {
      existing.name = name;
      existing.description = description;
    } else {
      this.props.translations.push({ locale, name, description });
    }
    this.touch();
  }

  removeTranslation(locale: string): void {
    this.props.translations = this.props.translations.filter((t) => t.locale !== locale);
    this.touch();
  }

  setQuoteForm(form: QuoteFormProps): void {
    this.props.quoteForm = form;
    this.touch();
  }

  publish(): void {
    canPublish({
      bookingMode: this.props.bookingMode,
      categoryId: this.props.categoryId,
      hasSourceName: this.props.translations.some(
        (t) => t.locale === this.props.sourceLocale && t.name.trim().length > 0,
      ),
      optionCount: this.props.options.length,
    });
    this.props.status = "published";
    this.touch();
    this._events.push(new ServicePublished({ serviceId: this.props.id }));
  }

  unpublish(): void {
    this.props.status = "draft";
    this.touch();
    this._events.push(new ServiceUnpublished({ serviceId: this.props.id }));
  }

  archive(): void {
    this.props.status = "archived";
    this.touch();
  }

  // `options.length` is only the right next slot while nothing has ever
  // been removed. Once a remove has happened the array is shorter, but a
  // surviving option can still carry a sortOrder higher than that new
  // length, so appending at `length` can land on a value already in use.
  // The highest sortOrder actually present, plus one, is never claimed
  // twice.
  private nextSortOrder(): number {
    return this.props.options.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;
  }

  private normaliseDefaults(): void {
    const normalised = withSingleDefault(this.props.options);
    this.props.options = normalised as ServiceOptionProps[];
  }

  private touch(): void {
    this.props.updatedAt = new Date();
    this._events.push(new ServiceUpdated({ serviceId: this.props.id }));
  }

  toJSON(): ServiceProps {
    return {
      ...this.props,
      options: this.props.options.map((o) => ({ ...o, translations: [...o.translations] })),
      translations: [...this.props.translations],
    };
  }

  pullEvents(): BaseDomainEvent[] {
    const events = [...this._events];
    this._events.length = 0;
    return events;
  }
}
