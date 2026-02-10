# Pricing Bounded Context

## 1. Overview

The Pricing Bounded Context manages **custom quote lifecycle, discount rules, and price calculation** for the Ntizo service marketplace platform. It is responsible for enabling the Custom Quote flow (Booking Path C), where customers request personalized pricing from specific providers, and for managing provider-configurable discount rules that apply automatically during price calculation.

**Owns:**
- Custom quote request and response lifecycle (request, respond, accept, decline, expire)
- Discount rule management (provider-configured volume, recurring, and first-time discounts)
- Price calculation engine (applies applicable discount rules to base amounts)

**Delegates:**
- Booking creation (on quote acceptance) to **Booking BC**
- Quote negotiation and messaging to **Communication BC** (provider/customer chat)
- Notifications (quote events, expiration alerts) to **Communication BC**
- Service and package details to **Catalog BC** (upstream)
- Provider and customer identity to **User BC** (upstream)

**Key Design Principles:**
- A QuoteRequest always targets a specific provider (not an open request to multiple providers like Task Bid Path D).
- The provider must have `accepts_custom_quotes = true` on their service or explicitly support quote-based pricing.
- Quote responses include a full price breakdown with line items, enabling transparent pricing.
- Discount rules are provider-owned and can apply globally (all services) or to specific services.
- Only the highest applicable discount is applied per booking; discounts do not stack.
- Quotes expire automatically after 48 hours if not responded to or accepted.

---

## 2. Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Quote Request** | A customer-initiated request sent to a specific provider for personalized pricing on a service or category. Contains a description of what the customer needs, preferred dates, location, and optional images. Always targets one provider. |
| **Quote Response** | A provider's formal reply to a quote request, containing a total price, a line-item price breakdown, optional discount details, a message, and a validity period. Each quote request can have at most one response. |
| **Price Breakdown** | A JSON array of line items, where each item has a description, unit price, quantity, and subtotal. The sum of all subtotals equals the base amount before any discount is applied. |
| **Discount Rule** | A provider-configured rule that defines automatic discounts. Can target all of a provider's services (service_id = null) or a specific service. Types include volume discounts (hours or days), recurring booking discounts, and first-time customer discounts. |
| **Volume Discount** | A discount that activates when the booking quantity (hours or days) exceeds a threshold. For example, "10% off for bookings of 5+ hours." |
| **Threshold** | The minimum quantity (hours or days) required to trigger a volume discount. Not applicable to recurring or first-time discount types. |
| **Discount Type** | Classification of a discount rule. `hours_volume`: triggered by booking hours exceeding a threshold. `days_volume`: triggered by booking days exceeding a threshold. `recurring`: applied to any recurring booking series. `first_time`: applied once per customer-provider pair on their first completed booking. |
| **Quote Expiration** | The automatic transition of a quote request or quote response to `expired` status. Quote requests expire 48 hours after creation if no response is received. Quote responses expire at their `valid_until` timestamp if not accepted. |
| **Price Calculation** | The process of determining the final amount for a booking by loading the base amount, finding all applicable discount rules, selecting the best (highest) discount, and computing the final total. |
| **Applicable Discount** | A discount rule whose conditions are met for a specific booking context (hours threshold met, days threshold met, customer is first-time, or booking is recurring). |
| **Best Discount** | When multiple discount rules are applicable, the one with the highest discount percentage is selected. Only one discount is applied per booking. |

---

## 3. Aggregates & Entities

### 3.1 QuoteRequest Aggregate

**Aggregate Root:** `QuoteRequest`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `customer_id` | `UUID` | FK -> users. Required. The customer requesting the quote |
| `provider_id` | `UUID` | FK -> users. Required. The provider being asked for a quote |
| `service_id` | `UUID \| null` | FK -> services. Nullable. If null, the request is for a general category |
| `category_id` | `UUID` | FK -> service_categories. Required. The service category for context |
| `title` | `string` | Required, max 200 chars. Brief summary of what the customer needs |
| `description` | `string` | Required, max 5000 chars. Detailed description of the work requested |
| `images` | `string[]` | JSON array of image URLs. Optional, max 10 images |
| `preferred_date` | `Date \| null` | Customer's preferred service date. Optional |
| `preferred_time` | `string \| null` | Customer's preferred time (HH:mm). Optional |
| `duration_days` | `number \| null` | For multi-day jobs, estimated number of days. Optional |
| `location_address` | `string \| null` | Service location address. Optional depending on service_location_type |
| `location_lat` | `number \| null` | Latitude of service location. Optional |
| `location_lng` | `number \| null` | Longitude of service location. Optional |
| `status` | `QuoteRequestStatus` | Enum: `pending`, `quoted`, `accepted`, `declined`, `expired`, `cancelled`. Default `pending` |
| `expires_at` | `Date` | Auto-set to created_at + 48 hours |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Status Transitions

```
                     ┌──────────────┐
                     │   PENDING    │
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
     respond()│      expire()│     cancel()│
              v             v             v
       ┌──────────┐  ┌──────────┐  ┌──────────────┐
       │  QUOTED  │  │ EXPIRED  │  │  CANCELLED   │
       └────┬─────┘  └──────────┘  └──────────────┘
            │
      ┌─────┼─────┐
      │     │     │
accept│ decline expire
      │     │     │
      v     v     v
┌─────────┐ ┌─────────┐ ┌─────────┐
│ACCEPTED │ │DECLINED │ │ EXPIRED │
└─────────┘ └─────────┘ └─────────┘
```

- `pending` -> `quoted`: Provider submits a QuoteResponse.
- `pending` -> `expired`: 48 hours pass without a provider response.
- `pending` -> `cancelled`: Customer cancels the request.
- `quoted` -> `accepted`: Customer accepts the quote response.
- `quoted` -> `declined`: Customer declines the quote response.
- `quoted` -> `expired`: Quote response's `valid_until` passes without customer action.

#### Invariants

1. A QuoteRequest must target a specific provider (`provider_id` is required, not nullable).
2. The targeted provider's service must accept custom quotes (`accepts_custom_quotes = true` on the service, or the service's `pricing_mode = 'quote'`).
3. A QuoteRequest can only be cancelled by the customer while in `pending` status.
4. `expires_at` is automatically set to `created_at + 48 hours` and cannot be manually overridden.
5. Only valid status transitions are allowed as defined in the state machine above.
6. `title` must be between 1 and 200 characters.
7. `description` must be between 1 and 5000 characters.
8. `images` array must not exceed 10 items.
9. A customer cannot create multiple pending QuoteRequests for the same provider+service combination.

#### Domain Logic

```typescript
import { Entity, DomainError } from 'onion-lasagna';

type QuoteRequestStatus = 'pending' | 'quoted' | 'accepted' | 'declined' | 'expired' | 'cancelled';

const QUOTE_REQUEST_EXPIRY_HOURS = 48;

interface QuoteRequestProps {
  customerId: string;
  providerId: string;
  serviceId: string | null;
  categoryId: string;
  title: string;
  description: string;
  images: string[];
  preferredDate: Date | null;
  preferredTime: string | null;
  durationDays: number | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  status: QuoteRequestStatus;
  expiresAt: Date;
}

class QuoteRequest extends Entity<QuoteRequestProps> {
  static create(props: {
    customerId: string;
    providerId: string;
    serviceId?: string | null;
    categoryId: string;
    title: string;
    description: string;
    images?: string[];
    preferredDate?: Date | null;
    preferredTime?: string | null;
    durationDays?: number | null;
    locationAddress?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
  }): QuoteRequest {
    if (!props.title || props.title.trim().length === 0) {
      throw new DomainError('Quote request title is required');
    }
    if (props.title.length > 200) {
      throw new DomainError('Quote request title must not exceed 200 characters');
    }
    if (!props.description || props.description.trim().length === 0) {
      throw new DomainError('Quote request description is required');
    }
    if (props.description.length > 5000) {
      throw new DomainError('Quote request description must not exceed 5000 characters');
    }

    const images = props.images ?? [];
    if (images.length > 10) {
      throw new DomainError('Quote request cannot have more than 10 images');
    }

    if (props.durationDays !== undefined && props.durationDays !== null && props.durationDays < 1) {
      throw new DomainError('Duration days must be at least 1');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + QUOTE_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000);

    const request = new QuoteRequest({
      customerId: props.customerId,
      providerId: props.providerId,
      serviceId: props.serviceId ?? null,
      categoryId: props.categoryId,
      title: props.title.trim(),
      description: props.description.trim(),
      images,
      preferredDate: props.preferredDate ?? null,
      preferredTime: props.preferredTime ?? null,
      durationDays: props.durationDays ?? null,
      locationAddress: props.locationAddress ?? null,
      locationLat: props.locationLat ?? null,
      locationLng: props.locationLng ?? null,
      status: 'pending',
      expiresAt,
    });

    request.addDomainEvent(new QuoteRequested(
      request.id,
      props.customerId,
      props.providerId,
      props.serviceId ?? null,
      props.categoryId,
      props.title.trim(),
    ));

    return request;
  }

  markAsQuoted(): void {
    if (this.props.status !== 'pending') {
      throw new DomainError(
        `Cannot mark quote request as quoted from '${this.props.status}' status. Must be pending.`
      );
    }
    this.props.status = 'quoted';
    this.markUpdated();
  }

  accept(): void {
    if (this.props.status !== 'quoted') {
      throw new DomainError(
        `Cannot accept quote request from '${this.props.status}' status. Must be quoted.`
      );
    }
    this.props.status = 'accepted';
    this.markUpdated();
  }

  decline(): void {
    if (this.props.status !== 'quoted') {
      throw new DomainError(
        `Cannot decline quote request from '${this.props.status}' status. Must be quoted.`
      );
    }
    this.props.status = 'declined';
    this.markUpdated();
  }

  decline(): void {
    if (this.props.status !== 'quoted') {
      throw new DomainError(
        `Cannot decline quote request from '${this.props.status}' status. Must be quoted.`
      );
    }
    this.props.status = 'declined';
    this.markUpdated();
  }

  cancel(): void {
    if (this.props.status !== 'pending') {
      throw new DomainError(
        `Cannot cancel quote request from '${this.props.status}' status. Must be pending.`
      );
    }
    this.props.status = 'cancelled';
    this.markUpdated();
  }

  expire(): void {
    if (this.props.status !== 'pending' && this.props.status !== 'quoted') {
      throw new DomainError(
        `Cannot expire quote request from '${this.props.status}' status. Must be pending or quoted.`
      );
    }
    this.props.status = 'expired';
    this.markUpdated();
    this.addDomainEvent(new QuoteExpired(
      this.id,
      null,
      this.props.customerId,
      this.props.providerId,
    ));
  }

  get isExpired(): boolean {
    return this.props.status === 'expired' || new Date() > this.props.expiresAt;
  }

  get isPending(): boolean {
    return this.props.status === 'pending';
  }
}
```

---

### 3.2 QuoteResponse Aggregate

**Aggregate Root:** `QuoteResponse`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `quote_request_id` | `UUID` | FK -> quote_requests. Required, unique (one response per request) |
| `provider_id` | `UUID` | FK -> users. Required. Must match the quote request's provider_id |
| `total_price` | `number` | Required, must be > 0. Stored as integer in smallest currency unit (cents) |
| `currency` | `string` | Required. ISO 4217 currency code (e.g., "MZN", "USD") |
| `price_breakdown` | `PriceBreakdownItem[]` | JSON array of line items. Required, at least one item |
| `discount_applied` | `string \| null` | Human-readable description of the discount applied. Nullable |
| `discount_amount` | `number \| null` | Amount deducted as discount. Stored as integer in smallest currency unit. Nullable |
| `message` | `string` | Required, max 2000 chars. Provider's message to the customer |
| `valid_until` | `Date` | Required. Must be in the future at creation time |
| `status` | `QuoteResponseStatus` | Enum: `pending`, `accepted`, `declined`, `expired`. Default `pending` |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Invariants

1. `total_price` must be greater than 0.
2. `price_breakdown` must contain at least one line item.
3. The sum of all `price_breakdown` item subtotals must equal the base amount. If a discount is applied: `total_price = sum(breakdown subtotals) - discount_amount`.
4. If no discount is applied: `total_price = sum(breakdown subtotals)`.
5. `valid_until` must be in the future at the time of creation.
6. Each quote request can have at most one response (unique constraint on `quote_request_id`).
7. Only the provider who received the original quote request can create a response (`provider_id` must match).
8. `message` must be between 1 and 2000 characters.
9. `discount_amount` must be >= 0 and less than the sum of breakdown subtotals (cannot discount more than the base amount).

#### Domain Logic

```typescript
type QuoteResponseStatus = 'pending' | 'accepted' | 'declined' | 'expired';

interface PriceBreakdownItem {
  item: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

interface QuoteResponseProps {
  quoteRequestId: string;
  providerId: string;
  totalPrice: number;
  currency: string;
  priceBreakdown: PriceBreakdownItem[];
  discountApplied: string | null;
  discountAmount: number | null;
  message: string;
  validUntil: Date;
  status: QuoteResponseStatus;
}

class QuoteResponse extends Entity<QuoteResponseProps> {
  static create(props: {
    quoteRequestId: string;
    providerId: string;
    totalPrice: number;
    currency: string;
    priceBreakdown: PriceBreakdownItem[];
    discountApplied?: string | null;
    discountAmount?: number | null;
    message: string;
    validUntil: Date;
  }): QuoteResponse {
    if (props.totalPrice <= 0) {
      throw new DomainError('Total price must be greater than 0');
    }

    if (!props.currency || props.currency.length !== 3) {
      throw new DomainError('Currency must be a 3-letter ISO 4217 code');
    }

    if (!props.priceBreakdown || props.priceBreakdown.length === 0) {
      throw new DomainError('Price breakdown must have at least one line item');
    }

    if (!props.message || props.message.trim().length === 0) {
      throw new DomainError('Quote response message is required');
    }
    if (props.message.length > 2000) {
      throw new DomainError('Quote response message must not exceed 2000 characters');
    }

    if (props.validUntil <= new Date()) {
      throw new DomainError('valid_until must be in the future');
    }

    // Validate breakdown consistency
    const breakdownTotal = props.priceBreakdown.reduce(
      (sum, item) => sum + item.subtotal, 0
    );

    for (const item of props.priceBreakdown) {
      const expectedSubtotal = item.unitPrice * item.quantity;
      if (Math.abs(item.subtotal - expectedSubtotal) > 1) {
        throw new DomainError(
          `Price breakdown item "${item.item}" subtotal (${item.subtotal}) does not match unit_price * quantity (${expectedSubtotal})`
        );
      }
    }

    const discountAmount = props.discountAmount ?? 0;

    if (discountAmount < 0) {
      throw new DomainError('Discount amount cannot be negative');
    }
    if (discountAmount >= breakdownTotal) {
      throw new DomainError('Discount amount cannot equal or exceed the base amount');
    }

    const expectedTotal = breakdownTotal - discountAmount;
    if (Math.abs(props.totalPrice - expectedTotal) > 1) {
      throw new DomainError(
        `Total price (${props.totalPrice}) does not match breakdown total (${breakdownTotal}) minus discount (${discountAmount}) = ${expectedTotal}`
      );
    }

    const response = new QuoteResponse({
      quoteRequestId: props.quoteRequestId,
      providerId: props.providerId,
      totalPrice: props.totalPrice,
      currency: props.currency.toUpperCase(),
      priceBreakdown: props.priceBreakdown,
      discountApplied: props.discountApplied ?? null,
      discountAmount: discountAmount > 0 ? discountAmount : null,
      message: props.message.trim(),
      validUntil: props.validUntil,
      status: 'pending',
    });

    return response;
  }

  accept(): void {
    if (this.props.status !== 'pending') {
      throw new DomainError(
        `Cannot accept quote response from '${this.props.status}' status. Must be pending.`
      );
    }
    if (new Date() > this.props.validUntil) {
      throw new DomainError('Cannot accept an expired quote response');
    }
    this.props.status = 'accepted';
    this.markUpdated();
    this.addDomainEvent(new QuoteAccepted(
      this.id,
      this.props.quoteRequestId,
      this.props.providerId,
      this.props.totalPrice,
      this.props.currency,
    ));
  }

  decline(reason?: string): void {
    if (this.props.status !== 'pending') {
      throw new DomainError(
        `Cannot decline quote response from '${this.props.status}' status. Must be pending.`
      );
    }
    this.props.status = 'declined';
    this.markUpdated();
    this.addDomainEvent(new QuoteDeclined(
      this.id,
      this.props.quoteRequestId,
      this.props.providerId,
      reason ?? null,
    ));
  }

  expire(): void {
    if (this.props.status !== 'pending') {
      throw new DomainError(
        `Cannot expire quote response from '${this.props.status}' status. Must be pending.`
      );
    }
    this.props.status = 'expired';
    this.markUpdated();
    this.addDomainEvent(new QuoteExpired(
      this.props.quoteRequestId,
      this.id,
      null, // customerId resolved at use case level from QuoteRequest
      this.props.providerId,
    ));
  }

  get isExpired(): boolean {
    return this.props.status === 'expired' || new Date() > this.props.validUntil;
  }

  get baseAmount(): number {
    return this.props.priceBreakdown.reduce((sum, item) => sum + item.subtotal, 0);
  }
}
```

---

### 3.3 DiscountRule Aggregate

**Aggregate Root:** `DiscountRule`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `provider_id` | `UUID` | FK -> users. Required. The provider who owns this rule |
| `service_id` | `UUID \| null` | FK -> services. Nullable. Null means the rule applies to all of the provider's services |
| `discount_type` | `DiscountType` | Enum: `hours_volume`, `days_volume`, `recurring`, `first_time`. Required |
| `threshold` | `number \| null` | Minimum quantity to trigger the discount. Required for volume types, null for recurring and first_time |
| `discount_percentage` | `number` | Required. Between 1 and 50 (inclusive). Represents the percentage off |
| `description` | `string` | Required, max 200 chars. Human-readable description (e.g., "10% off for 5+ hours") |
| `is_active` | `boolean` | Default `true`. Inactive rules are excluded from price calculations |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Invariants

1. `discount_percentage` must be between 1 and 50 inclusive (maximum 50% discount allowed).
2. `threshold` must be > 0 for `hours_volume` and `days_volume` types.
3. `threshold` must be null for `recurring` and `first_time` types (no threshold needed).
4. `first_time` discount applies only once per unique customer-provider pair, on their first completed booking.
5. `recurring` discount applies automatically to any booking that is part of a recurring series.
6. Cannot have duplicate active rules for the same provider + service + discount_type combination. One active rule per type per scope.
7. `description` must be between 1 and 200 characters.
8. If `service_id` is null, the rule applies to all services of the provider.

#### Domain Logic

```typescript
type DiscountType = 'hours_volume' | 'days_volume' | 'recurring' | 'first_time';

interface DiscountRuleProps {
  providerId: string;
  serviceId: string | null;
  discountType: DiscountType;
  threshold: number | null;
  discountPercentage: number;
  description: string;
  isActive: boolean;
}

class DiscountRule extends Entity<DiscountRuleProps> {
  static create(props: {
    providerId: string;
    serviceId?: string | null;
    discountType: DiscountType;
    threshold?: number | null;
    discountPercentage: number;
    description: string;
  }): DiscountRule {
    if (props.discountPercentage < 1 || props.discountPercentage > 50) {
      throw new DomainError('Discount percentage must be between 1 and 50');
    }

    if (!props.description || props.description.trim().length === 0) {
      throw new DomainError('Discount rule description is required');
    }
    if (props.description.length > 200) {
      throw new DomainError('Discount rule description must not exceed 200 characters');
    }

    // Validate threshold based on discount type
    const isVolumeType = props.discountType === 'hours_volume' || props.discountType === 'days_volume';
    if (isVolumeType) {
      if (!props.threshold || props.threshold <= 0) {
        throw new DomainError(
          `Threshold must be greater than 0 for ${props.discountType} discount type`
        );
      }
    }

    const isNonVolumeType = props.discountType === 'recurring' || props.discountType === 'first_time';
    if (isNonVolumeType && props.threshold !== undefined && props.threshold !== null) {
      throw new DomainError(
        `Threshold must not be set for ${props.discountType} discount type`
      );
    }

    return new DiscountRule({
      providerId: props.providerId,
      serviceId: props.serviceId ?? null,
      discountType: props.discountType,
      threshold: isVolumeType ? props.threshold! : null,
      discountPercentage: props.discountPercentage,
      description: props.description.trim(),
      isActive: true,
    });
  }

  update(data: {
    threshold?: number;
    discountPercentage?: number;
    description?: string;
    isActive?: boolean;
  }): void {
    if (data.discountPercentage !== undefined) {
      if (data.discountPercentage < 1 || data.discountPercentage > 50) {
        throw new DomainError('Discount percentage must be between 1 and 50');
      }
      this.props.discountPercentage = data.discountPercentage;
    }

    if (data.threshold !== undefined) {
      const isVolumeType = this.props.discountType === 'hours_volume'
        || this.props.discountType === 'days_volume';
      if (!isVolumeType) {
        throw new DomainError(
          `Cannot set threshold for ${this.props.discountType} discount type`
        );
      }
      if (data.threshold <= 0) {
        throw new DomainError('Threshold must be greater than 0');
      }
      this.props.threshold = data.threshold;
    }

    if (data.description !== undefined) {
      if (!data.description || data.description.trim().length === 0) {
        throw new DomainError('Discount rule description is required');
      }
      if (data.description.length > 200) {
        throw new DomainError('Discount rule description must not exceed 200 characters');
      }
      this.props.description = data.description.trim();
    }

    if (data.isActive !== undefined) {
      this.props.isActive = data.isActive;
    }

    this.markUpdated();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.markUpdated();
  }

  activate(): void {
    this.props.isActive = true;
    this.markUpdated();
  }

  isApplicable(params: {
    hours?: number;
    days?: number;
    isRecurring?: boolean;
    isFirstTime?: boolean;
  }): boolean {
    if (!this.props.isActive) return false;

    switch (this.props.discountType) {
      case 'hours_volume':
        return (params.hours ?? 0) >= this.props.threshold!;
      case 'days_volume':
        return (params.days ?? 0) >= this.props.threshold!;
      case 'recurring':
        return params.isRecurring === true;
      case 'first_time':
        return params.isFirstTime === true;
      default:
        return false;
    }
  }

  calculateDiscount(baseAmount: number): number {
    return Math.round(baseAmount * this.props.discountPercentage / 100);
  }

  get isGlobal(): boolean {
    return this.props.serviceId === null;
  }

  get isServiceSpecific(): boolean {
    return this.props.serviceId !== null;
  }
}
```

---

## 4. Value Objects

### QuoteRequestId

```typescript
class QuoteRequestId {
  private constructor(private readonly value: string) {
    if (!QuoteRequestId.isValid(value)) {
      throw new DomainError('Invalid QuoteRequestId format');
    }
  }

  static create(value: string): QuoteRequestId {
    return new QuoteRequestId(value);
  }

  static generate(): QuoteRequestId {
    return new QuoteRequestId(crypto.randomUUID());
  }

  static isValid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: QuoteRequestId): boolean {
    return this.value === other.value;
  }
}
```

### QuoteResponseId

```typescript
class QuoteResponseId {
  private constructor(private readonly value: string) {
    if (!QuoteResponseId.isValid(value)) {
      throw new DomainError('Invalid QuoteResponseId format');
    }
  }

  static create(value: string): QuoteResponseId {
    return new QuoteResponseId(value);
  }

  static generate(): QuoteResponseId {
    return new QuoteResponseId(crypto.randomUUID());
  }

  static isValid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: QuoteResponseId): boolean {
    return this.value === other.value;
  }
}
```

### DiscountRuleId

```typescript
class DiscountRuleId {
  private constructor(private readonly value: string) {
    if (!DiscountRuleId.isValid(value)) {
      throw new DomainError('Invalid DiscountRuleId format');
    }
  }

  static create(value: string): DiscountRuleId {
    return new DiscountRuleId(value);
  }

  static generate(): DiscountRuleId {
    return new DiscountRuleId(crypto.randomUUID());
  }

  static isValid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: DiscountRuleId): boolean {
    return this.value === other.value;
  }
}
```

### Enums

```typescript
const QuoteRequestStatus = {
  PENDING: 'pending',
  QUOTED: 'quoted',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;
type QuoteRequestStatus = (typeof QuoteRequestStatus)[keyof typeof QuoteRequestStatus];

const QuoteResponseStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
} as const;
type QuoteResponseStatus = (typeof QuoteResponseStatus)[keyof typeof QuoteResponseStatus];

const DiscountType = {
  HOURS_VOLUME: 'hours_volume',
  DAYS_VOLUME: 'days_volume',
  RECURRING: 'recurring',
  FIRST_TIME: 'first_time',
} as const;
type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];
```

### Money

```typescript
class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {}

  static create(amount: number, currency: string): Money {
    if (amount < 0) {
      throw new DomainError('Money amount cannot be negative');
    }
    if (!currency || currency.length !== 3) {
      throw new DomainError('Currency must be a 3-letter ISO 4217 code');
    }
    return new Money(amount, currency.toUpperCase());
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new DomainError('Cannot add Money with different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new DomainError('Cannot subtract Money with different currencies');
    }
    if (this.amount < other.amount) {
      throw new DomainError('Resulting amount cannot be negative');
    }
    return new Money(this.amount - other.amount, this.currency);
  }

  applyPercentageDiscount(percentage: number): Money {
    if (percentage < 0 || percentage > 100) {
      throw new DomainError('Discount percentage must be between 0 and 100');
    }
    const discountAmount = Math.round(this.amount * percentage / 100);
    return new Money(this.amount - discountAmount, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toString(): string {
    return `${this.currency} ${(this.amount / 100).toFixed(2)}`;
  }
}
```

### PriceBreakdownItem

```typescript
class PriceBreakdownItem {
  private constructor(
    public readonly item: string,
    public readonly unitPrice: number,
    public readonly quantity: number,
    public readonly subtotal: number,
  ) {}

  static create(props: {
    item: string;
    unitPrice: number;
    quantity: number;
  }): PriceBreakdownItem {
    if (!props.item || props.item.trim().length === 0) {
      throw new DomainError('Price breakdown item description is required');
    }
    if (props.unitPrice < 0) {
      throw new DomainError('Unit price cannot be negative');
    }
    if (props.quantity <= 0) {
      throw new DomainError('Quantity must be greater than 0');
    }

    const subtotal = Math.round(props.unitPrice * props.quantity);

    return new PriceBreakdownItem(
      props.item.trim(),
      props.unitPrice,
      props.quantity,
      subtotal,
    );
  }

  equals(other: PriceBreakdownItem): boolean {
    return this.item === other.item
      && this.unitPrice === other.unitPrice
      && this.quantity === other.quantity;
  }
}
```

### PriceCalculation

```typescript
class PriceCalculation {
  private constructor(
    public readonly baseAmount: number,
    public readonly discountAmount: number,
    public readonly discountDescription: string | null,
    public readonly discountRuleId: string | null,
    public readonly totalAmount: number,
    public readonly currency: string,
  ) {}

  static create(props: {
    baseAmount: number;
    discountAmount?: number;
    discountDescription?: string | null;
    discountRuleId?: string | null;
    currency: string;
  }): PriceCalculation {
    const discountAmount = props.discountAmount ?? 0;
    const totalAmount = props.baseAmount - discountAmount;

    if (totalAmount < 0) {
      throw new DomainError('Total amount cannot be negative after discount');
    }

    return new PriceCalculation(
      props.baseAmount,
      discountAmount,
      props.discountDescription ?? null,
      props.discountRuleId ?? null,
      totalAmount,
      props.currency,
    );
  }

  get hasDiscount(): boolean {
    return this.discountAmount > 0;
  }

  get discountPercentage(): number {
    if (this.baseAmount === 0) return 0;
    return Math.round((this.discountAmount / this.baseAmount) * 100);
  }
}
```

---

## 5. Domain Events

### QuoteRequested

- **Trigger:** Customer creates a new quote request targeting a specific provider.
- **Payload:**
  ```typescript
  interface QuoteRequestedEvent {
    quoteRequestId: string;
    customerId: string;
    providerId: string;
    serviceId: string | null;
    categoryId: string;
    title: string;
    requestedAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Send a push notification and in-app notification to the provider informing them of a new quote request.
  - Communication BC: Create a conversation thread between the customer and provider for negotiation.

### QuoteResponded

- **Trigger:** Provider submits a quote response with pricing details.
- **Payload:**
  ```typescript
  interface QuoteRespondedEvent {
    quoteResponseId: string;
    quoteRequestId: string;
    providerId: string;
    customerId: string;
    totalPrice: number;
    currency: string;
    validUntil: Date;
    respondedAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Notify the customer that the provider has responded with a quote. Include the total price in the notification.

### QuoteAccepted

- **Trigger:** Customer accepts a quote response.
- **Payload:**
  ```typescript
  interface QuoteAcceptedEvent {
    quoteResponseId: string;
    quoteRequestId: string;
    customerId: string;
    providerId: string;
    totalPrice: number;
    currency: string;
    acceptedAt: Date;
  }
  ```
- **Handlers:**
  - Booking BC: Create a new booking using the accepted quote details (Path C booking). The booking captures the quote response's price breakdown as its pricing snapshot.
  - Communication BC: Notify the provider that the customer has accepted the quote.

### QuoteDeclined

- **Trigger:** Customer declines a quote response.
- **Payload:**
  ```typescript
  interface QuoteDeclinedEvent {
    quoteResponseId: string;
    quoteRequestId: string;
    customerId: string;
    providerId: string;
    reason: string | null;
    declinedAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Notify the provider that the customer has declined the quote, including the reason if provided.

### QuoteExpired

- **Trigger:** Scheduled job detects that a quote request or quote response has passed its expiration time without action.
- **Payload:**
  ```typescript
  interface QuoteExpiredEvent {
    quoteRequestId: string | null;
    quoteResponseId: string | null;
    customerId: string | null;
    providerId: string;
    expiredAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Notify both the customer and provider that the quote has expired. If the request expired (no response), prompt the customer to try another provider. If the response expired (not accepted), inform both parties.

### DiscountApplied

- **Trigger:** Price calculation engine applies a discount rule to a booking.
- **Payload:**
  ```typescript
  interface DiscountAppliedEvent {
    bookingId: string;
    discountRuleId: string;
    discountType: DiscountType;
    discountPercentage: number;
    discountAmount: number;
    originalAmount: number;
    finalAmount: number;
    currency: string;
    appliedAt: Date;
  }
  ```
- **Handlers:**
  - Booking BC: Record the discount details in the booking's pricing snapshot for auditing and display.
  - Communication BC: Notify the customer that a discount has been applied to their booking (e.g., "You saved 10% on your booking!").

---

## 6. Use Cases

### RequestCustomQuote

- **Actor:** Customer
- **Preconditions:** Customer has an active account. Provider exists and has at least one service that accepts custom quotes or uses quote pricing mode.
- **Input:**
  ```typescript
  interface RequestCustomQuoteInput {
    customerId: string;
    providerId: string;
    serviceId?: string;
    categoryId: string;
    title: string;
    description: string;
    images?: string[];
    preferredDate?: Date;
    preferredTime?: string;
    durationDays?: number;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
  }
  ```
- **Output:** `QuoteRequest` (in `pending` status)
- **Process Flow:**
  1. Validate the customer has an active account.
  2. Validate the provider exists and is verified.
  3. If `serviceId` is provided, validate the service exists, is published, and accepts custom quotes (`accepts_custom_quotes = true` or `pricing_mode = 'quote'`).
  4. Validate the category exists and is active.
  5. Check for duplicate pending quote requests from this customer to this provider for the same service.
  6. Create QuoteRequest entity (sets `expires_at` to now + 48h).
  7. Persist via QuoteRequestRepository.
  8. Return created QuoteRequest.
- **Events Raised:** `QuoteRequested`
- **Error Cases:**
  - `ProviderNotFoundError`: Provider does not exist.
  - `ServiceNotFoundError`: Service does not exist or is not published.
  - `QuoteNotAcceptedError`: Service does not accept custom quotes.
  - `DuplicateQuoteRequestError`: Customer already has a pending request for this provider+service.
  - `ValidationError`: Invalid input fields.

### RespondToQuote

- **Actor:** Provider
- **Preconditions:** Quote request exists and is in `pending` status. Provider is the one who received the request.
- **Input:**
  ```typescript
  interface RespondToQuoteInput {
    quoteRequestId: string;
    providerId: string;
    totalPrice: number;
    currency: string;
    priceBreakdown: Array<{
      item: string;
      unitPrice: number;
      quantity: number;
    }>;
    discountApplied?: string;
    discountAmount?: number;
    message: string;
    validUntil: Date;
  }
  ```
- **Output:** `QuoteResponse` (in `pending` status)
- **Process Flow:**
  1. Load QuoteRequest by ID.
  2. Verify the caller is the provider who received the request (`providerId` matches).
  3. Verify the quote request is in `pending` status and has not expired.
  4. Build PriceBreakdownItem array, computing subtotals.
  5. Create QuoteResponse entity with validation (breakdown sums, discount consistency).
  6. Mark the QuoteRequest as `quoted` via `quoteRequest.markAsQuoted()`.
  7. Persist QuoteResponse via QuoteResponseRepository.
  8. Persist updated QuoteRequest via QuoteRequestRepository.
  9. Return created QuoteResponse.
- **Events Raised:** `QuoteResponded`
- **Error Cases:**
  - `QuoteRequestNotFoundError`: Quote request does not exist.
  - `UnauthorizedError`: Caller is not the intended provider.
  - `InvalidStateError`: Quote request is not in pending status.
  - `QuoteExpiredError`: Quote request has expired.
  - `ValidationError`: Invalid pricing, breakdown inconsistency, or missing fields.

### AcceptQuote

- **Actor:** Customer
- **Preconditions:** Quote response exists and is in `pending` status. Customer owns the original request.
- **Input:**
  ```typescript
  interface AcceptQuoteInput {
    quoteResponseId: string;
    customerId: string;
  }
  ```
- **Output:** `QuoteResponse` (in `accepted` status). Triggers booking creation in Booking BC.
- **Process Flow:**
  1. Load QuoteResponse by ID.
  2. Load the associated QuoteRequest.
  3. Verify the caller is the customer who created the original request.
  4. Verify the quote response is in `pending` status and `valid_until` has not passed.
  5. Call `quoteResponse.accept()`.
  6. Call `quoteRequest.accept()`.
  7. Persist both entities.
  8. Return updated QuoteResponse.
- **Events Raised:** `QuoteAccepted` (Booking BC consumes this to create a Path C booking)
- **Error Cases:**
  - `QuoteResponseNotFoundError`: Quote response does not exist.
  - `UnauthorizedError`: Caller is not the customer who created the request.
  - `InvalidStateError`: Quote response is not in pending status.
  - `QuoteExpiredError`: Quote response has passed its `valid_until` timestamp.

### DeclineQuote

- **Actor:** Customer
- **Preconditions:** Quote response exists and is in `pending` status. Customer owns the original request.
- **Input:**
  ```typescript
  interface DeclineQuoteInput {
    quoteResponseId: string;
    customerId: string;
    reason?: string;
  }
  ```
- **Output:** `QuoteResponse` (in `declined` status)
- **Process Flow:**
  1. Load QuoteResponse by ID.
  2. Load the associated QuoteRequest.
  3. Verify the caller is the customer who created the original request.
  4. Verify the quote response is in `pending` status.
  5. Call `quoteResponse.decline(reason)`.
  6. Call `quoteRequest.decline()`.
  7. Persist both entities.
  8. Return updated QuoteResponse.
- **Events Raised:** `QuoteDeclined`
- **Error Cases:**
  - `QuoteResponseNotFoundError`: Quote response does not exist.
  - `UnauthorizedError`: Caller is not the customer who created the request.
  - `InvalidStateError`: Quote response is not in pending status.

### CancelQuoteRequest

- **Actor:** Customer
- **Preconditions:** Quote request exists and is in `pending` status.
- **Input:**
  ```typescript
  interface CancelQuoteRequestInput {
    quoteRequestId: string;
    customerId: string;
  }
  ```
- **Output:** `QuoteRequest` (in `cancelled` status)
- **Process Flow:**
  1. Load QuoteRequest by ID.
  2. Verify the caller is the customer who created the request.
  3. Verify the request is in `pending` status (can only cancel before provider responds).
  4. Call `quoteRequest.cancel()`.
  5. Persist via QuoteRequestRepository.
  6. Return updated QuoteRequest.
- **Events Raised:** None (cancellation is a local state change; provider is not notified since they had not responded).
- **Error Cases:**
  - `QuoteRequestNotFoundError`: Quote request does not exist.
  - `UnauthorizedError`: Caller is not the customer who created the request.
  - `InvalidStateError`: Quote request is not in pending status.

### ExpireQuotes (Scheduled)

- **Actor:** System (scheduled job, runs periodically, e.g., every 15 minutes)
- **Preconditions:** None.
- **Input:** None (job processes all eligible records).
- **Output:** Count of expired quote requests and quote responses.
- **Process Flow:**
  1. Query QuoteRequestRepository for all requests with status `pending` and `expires_at <= now()`.
  2. For each expired request, call `quoteRequest.expire()` and persist.
  3. Query QuoteResponseRepository for all responses with status `pending` and `valid_until <= now()`.
  4. For each expired response:
     a. Call `quoteResponse.expire()` and persist.
     b. Load the associated QuoteRequest and call `quoteRequest.expire()` and persist.
  5. Return count of processed records.
- **Events Raised:** `QuoteExpired` (for each expired request/response)
- **Error Cases:**
  - None (job is idempotent; errors on individual records are logged and skipped).

### CreateDiscountRule

- **Actor:** Provider (individual_provider or organization_owner)
- **Preconditions:** Provider has an active, verified account. If service_id is provided, the service must belong to the provider.
- **Input:**
  ```typescript
  interface CreateDiscountRuleInput {
    providerId: string;
    serviceId?: string;
    discountType: DiscountType;
    threshold?: number;
    discountPercentage: number;
    description: string;
  }
  ```
- **Output:** `DiscountRule`
- **Process Flow:**
  1. Validate the provider has an active account.
  2. If `serviceId` is provided, validate the service exists and belongs to the provider.
  3. Check for duplicate active rules (same provider + service + discount_type combination).
  4. Create DiscountRule entity with validation.
  5. Persist via DiscountRuleRepository.
  6. Return created DiscountRule.
- **Events Raised:** None.
- **Error Cases:**
  - `ProviderNotFoundError`: Provider does not exist.
  - `ServiceNotFoundError`: Service does not exist or does not belong to this provider.
  - `DuplicateDiscountRuleError`: An active rule already exists for this provider+service+type.
  - `ValidationError`: Invalid percentage, threshold, or description.

### UpdateDiscountRule

- **Actor:** Provider (owner of the rule)
- **Preconditions:** Discount rule exists. Provider is the owner.
- **Input:**
  ```typescript
  interface UpdateDiscountRuleInput {
    ruleId: string;
    providerId: string;
    threshold?: number;
    discountPercentage?: number;
    description?: string;
    isActive?: boolean;
  }
  ```
- **Output:** Updated `DiscountRule`
- **Process Flow:**
  1. Load DiscountRule by ID.
  2. Verify the caller is the provider who owns the rule.
  3. If reactivating, check for duplicate active rules.
  4. Call `rule.update(data)`.
  5. Persist via DiscountRuleRepository.
  6. Return updated DiscountRule.
- **Events Raised:** None.
- **Error Cases:**
  - `DiscountRuleNotFoundError`: Rule does not exist.
  - `UnauthorizedError`: Caller is not the rule owner.
  - `DuplicateDiscountRuleError`: Reactivating would create a duplicate active rule.
  - `ValidationError`: Invalid percentage or threshold.

### DeleteDiscountRule

- **Actor:** Provider (owner of the rule)
- **Preconditions:** Discount rule exists. Provider is the owner.
- **Input:**
  ```typescript
  interface DeleteDiscountRuleInput {
    ruleId: string;
    providerId: string;
  }
  ```
- **Output:** `void`
- **Process Flow:**
  1. Load DiscountRule by ID.
  2. Verify the caller is the provider who owns the rule.
  3. Delete via DiscountRuleRepository.
- **Events Raised:** None.
- **Error Cases:**
  - `DiscountRuleNotFoundError`: Rule does not exist.
  - `UnauthorizedError`: Caller is not the rule owner.

### CalculatePrice

- **Actor:** System (called by Booking BC during booking creation for Path A, B, and D bookings)
- **Preconditions:** Service exists and is published.
- **Input:**
  ```typescript
  interface CalculatePriceInput {
    serviceId: string;
    providerId: string;
    packageId?: string;
    hours?: number;
    days?: number;
    customerId: string;
    isRecurring?: boolean;
    currency: string;
  }
  ```
- **Output:** `PriceCalculation`
- **Process Flow:**

```
Input: serviceId, providerId, packageId?, hours?, days?, customerId, isRecurring?, currency
1. Determine base amount:
   a. If packageId is provided:
      - Load the package from Catalog BC
      - baseAmount = package.fixedPrice
   b. If hours is provided (hourly pricing):
      - Load service from Catalog BC
      - baseAmount = service.hourlyRate * hours
   c. If days is provided (daily pricing):
      - Load service from Catalog BC
      - baseAmount = service.hourlyRate * 8 * days (or use daily rate if defined)
2. Check if customer is first-time with this provider:
   - Query Booking BC (or local read model) for any completed bookings
     by this customer with this provider
   - isFirstTime = (count === 0)
3. Load all applicable discount rules:
   - Query DiscountRuleRepository.findApplicable(providerId, serviceId, {
       hours, days, isRecurring, isFirstTime
     })
   - This returns active rules that match the provider and apply to
     this service (or are global), filtered by their conditions
4. For each rule, check if conditions are met:
   - hours_volume: hours >= rule.threshold
   - days_volume: days >= rule.threshold
   - recurring: isRecurring === true
   - first_time: isFirstTime === true
5. Filter to only applicable rules
6. If multiple rules apply, select the one with the highest
   discount_percentage (best discount wins; no stacking)
7. Calculate discount amount:
   - discountAmount = Math.round(baseAmount * bestRule.discountPercentage / 100)
8. Calculate final amount:
   - totalAmount = baseAmount - discountAmount
9. Return PriceCalculation:
   {
     baseAmount,
     discountAmount,
     discountDescription: bestRule.description,
     discountRuleId: bestRule.id,
     totalAmount,
     currency
   }
10. If no applicable rules, return PriceCalculation with discountAmount = 0
```

- **Events Raised:** `DiscountApplied` (only if a discount was applied)
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `PackageNotFoundError`: Package does not exist.
  - `ValidationError`: Missing required pricing inputs.

**Price Calculation Example:**

A customer books a cleaning service for 6 hours at 500 MZN/hour. The provider has two active discount rules:
- `hours_volume`: 10% off for 5+ hours
- `first_time`: 15% off for first-time customers

The customer has booked with this provider before, so `first_time` does not apply.

| Step | Detail | Amount |
|------|--------|--------|
| Base amount | 500 * 6 hours | 3,000 MZN |
| Applicable rules | hours_volume (6 >= 5 threshold) | 10% |
| Discount amount | 3,000 * 10% | 300 MZN |
| **Final amount** | 3,000 - 300 | **2,700 MZN** |

---

## 7. Repository Ports

```typescript
interface QuoteRequestRepository {
  findById(id: string): Promise<QuoteRequest | null>;
  findByCustomer(
    customerId: string,
    pagination: { limit: number; offset: number },
  ): Promise<{ requests: QuoteRequest[]; total: number }>;
  findByProvider(
    providerId: string,
    pagination: { limit: number; offset: number },
  ): Promise<{ requests: QuoteRequest[]; total: number }>;
  findByCustomerAndProvider(
    customerId: string,
    providerId: string,
    serviceId: string | null,
    status?: QuoteRequestStatus,
  ): Promise<QuoteRequest[]>;
  findExpired(): Promise<QuoteRequest[]>;
  findByStatus(
    status: QuoteRequestStatus,
    pagination: { limit: number; offset: number },
  ): Promise<{ requests: QuoteRequest[]; total: number }>;
  save(quote: QuoteRequest): Promise<void>;
}

interface QuoteResponseRepository {
  findById(id: string): Promise<QuoteResponse | null>;
  findByQuoteRequest(quoteRequestId: string): Promise<QuoteResponse | null>;
  findExpired(): Promise<QuoteResponse[]>;
  findByProvider(
    providerId: string,
    pagination: { limit: number; offset: number },
  ): Promise<{ responses: QuoteResponse[]; total: number }>;
  save(response: QuoteResponse): Promise<void>;
}

interface DiscountRuleRepository {
  findById(id: string): Promise<DiscountRule | null>;
  findByProvider(providerId: string): Promise<DiscountRule[]>;
  findActiveByProvider(providerId: string): Promise<DiscountRule[]>;
  findByService(serviceId: string): Promise<DiscountRule[]>;
  findActiveByService(serviceId: string): Promise<DiscountRule[]>;
  findApplicable(
    providerId: string,
    serviceId: string,
    params: DiscountParams,
  ): Promise<DiscountRule[]>;
  findByProviderServiceAndType(
    providerId: string,
    serviceId: string | null,
    discountType: DiscountType,
    activeOnly: boolean,
  ): Promise<DiscountRule | null>;
  save(rule: DiscountRule): Promise<void>;
  delete(ruleId: string): Promise<void>;
}

interface DiscountParams {
  hours?: number;
  days?: number;
  isRecurring?: boolean;
  isFirstTime?: boolean;
}
```

**Note on `findApplicable`:** This method loads all active discount rules that could potentially apply to the given provider and service. It returns rules where:
- `provider_id` matches AND (`service_id` matches OR `service_id` IS NULL for global rules)
- `is_active = true`
- The actual threshold/condition checking is done in-memory by the domain (via `DiscountRule.isApplicable()`) to keep repository logic simple.

---

## 8. Entity Schemas

### Quote Requests Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `customer_id` | `uuid` | NOT NULL |
| `provider_id` | `uuid` | NOT NULL |
| `service_id` | `uuid` | nullable |
| `category_id` | `uuid` | NOT NULL |
| `title` | `varchar(200)` | NOT NULL |
| `description` | `text` | NOT NULL |
| `images` | `jsonb` | NOT NULL, default `'[]'::jsonb` |
| `preferred_date` | `date` | nullable |
| `preferred_time` | `time` | nullable |
| `duration_days` | `integer` | nullable, CHECK `>= 1` when not null |
| `location_address` | `text` | nullable |
| `location_lat` | `decimal(10,7)` | nullable |
| `location_lng` | `decimal(10,7)` | nullable |
| `status` | `varchar(20)` | NOT NULL, default `'pending'`, CHECK IN (`pending`, `quoted`, `accepted`, `declined`, `expired`, `cancelled`) |
| `expires_at` | `timestamptz` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_quote_requests_customer` on `customer_id`
- `idx_quote_requests_provider` on `provider_id`
- `idx_quote_requests_service` on `service_id`
- `idx_quote_requests_category` on `category_id`
- `idx_quote_requests_status` on `status`
- `idx_quote_requests_expires_at` on `expires_at` WHERE `status IN ('pending', 'quoted')` (partial index for expiration job)
- `uq_quote_requests_pending` UNIQUE on (`customer_id`, `provider_id`, `service_id`) WHERE `status = 'pending'` (partial unique index preventing duplicate pending requests)

### Quote Responses Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `quote_request_id` | `uuid` | FK -> `quote_requests.id`, NOT NULL, UNIQUE |
| `provider_id` | `uuid` | NOT NULL |
| `total_price` | `decimal(12,2)` | NOT NULL, CHECK `> 0` |
| `currency` | `varchar(3)` | NOT NULL |
| `price_breakdown` | `jsonb` | NOT NULL |
| `discount_applied` | `text` | nullable |
| `discount_amount` | `decimal(12,2)` | nullable, CHECK `>= 0` when not null |
| `message` | `text` | NOT NULL |
| `valid_until` | `timestamptz` | NOT NULL |
| `status` | `varchar(20)` | NOT NULL, default `'pending'`, CHECK IN (`pending`, `accepted`, `declined`, `expired`) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `uq_quote_responses_request` UNIQUE on `quote_request_id` (one response per request)
- `idx_quote_responses_provider` on `provider_id`
- `idx_quote_responses_status` on `status`
- `idx_quote_responses_valid_until` on `valid_until` WHERE `status = 'pending'` (partial index for expiration job)

### Discount Rules Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `provider_id` | `uuid` | NOT NULL |
| `service_id` | `uuid` | nullable |
| `discount_type` | `varchar(20)` | NOT NULL, CHECK IN (`hours_volume`, `days_volume`, `recurring`, `first_time`) |
| `threshold` | `decimal(10,2)` | nullable |
| `discount_percentage` | `decimal(5,2)` | NOT NULL, CHECK `>= 1 AND <= 50` |
| `description` | `varchar(200)` | NOT NULL |
| `is_active` | `boolean` | NOT NULL, default `true` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_discount_rules_provider` on `provider_id`
- `idx_discount_rules_service` on `service_id`
- `idx_discount_rules_type` on `discount_type`
- `idx_discount_rules_is_active` on `is_active`
- `uq_discount_rules_active` UNIQUE on (`provider_id`, `service_id`, `discount_type`) WHERE `is_active = true` (partial unique index preventing duplicate active rules per scope and type)

### Drizzle ORM Schema

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
  decimal,
  integer,
  date,
  time,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const quoteRequests = pgTable(
  'quote_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull(),
    providerId: uuid('provider_id').notNull(),
    serviceId: uuid('service_id'),
    categoryId: uuid('category_id').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    images: jsonb('images').notNull().default(sql`'[]'::jsonb`),
    preferredDate: date('preferred_date'),
    preferredTime: time('preferred_time'),
    durationDays: integer('duration_days'),
    locationAddress: text('location_address'),
    locationLat: decimal('location_lat', { precision: 10, scale: 7 }),
    locationLng: decimal('location_lng', { precision: 10, scale: 7 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_quote_requests_customer').on(table.customerId),
    index('idx_quote_requests_provider').on(table.providerId),
    index('idx_quote_requests_service').on(table.serviceId),
    index('idx_quote_requests_category').on(table.categoryId),
    index('idx_quote_requests_status').on(table.status),
    index('idx_quote_requests_expires_at')
      .on(table.expiresAt)
      .where(sql`${table.status} IN ('pending', 'quoted')`),
    uniqueIndex('uq_quote_requests_pending')
      .on(table.customerId, table.providerId, table.serviceId)
      .where(sql`${table.status} = 'pending'`),
    check(
      'quote_request_status_check',
      sql`${table.status} IN ('pending', 'quoted', 'accepted', 'declined', 'expired', 'cancelled')`,
    ),
    check(
      'duration_days_check',
      sql`${table.durationDays} IS NULL OR ${table.durationDays} >= 1`,
    ),
  ],
);

export const quoteResponses = pgTable(
  'quote_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quoteRequestId: uuid('quote_request_id')
      .notNull()
      .references(() => quoteRequests.id, { onDelete: 'cascade' })
      .unique(),
    providerId: uuid('provider_id').notNull(),
    totalPrice: decimal('total_price', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    priceBreakdown: jsonb('price_breakdown').notNull(),
    discountApplied: text('discount_applied'),
    discountAmount: decimal('discount_amount', { precision: 12, scale: 2 }),
    message: text('message').notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_quote_responses_provider').on(table.providerId),
    index('idx_quote_responses_status').on(table.status),
    index('idx_quote_responses_valid_until')
      .on(table.validUntil)
      .where(sql`${table.status} = 'pending'`),
    check(
      'quote_response_status_check',
      sql`${table.status} IN ('pending', 'accepted', 'declined', 'expired')`,
    ),
    check(
      'total_price_positive_check',
      sql`${table.totalPrice} > 0`,
    ),
    check(
      'discount_amount_non_negative_check',
      sql`${table.discountAmount} IS NULL OR ${table.discountAmount} >= 0`,
    ),
  ],
);

export const discountRules = pgTable(
  'discount_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull(),
    serviceId: uuid('service_id'),
    discountType: varchar('discount_type', { length: 20 }).notNull(),
    threshold: decimal('threshold', { precision: 10, scale: 2 }),
    discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).notNull(),
    description: varchar('description', { length: 200 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_discount_rules_provider').on(table.providerId),
    index('idx_discount_rules_service').on(table.serviceId),
    index('idx_discount_rules_type').on(table.discountType),
    index('idx_discount_rules_is_active').on(table.isActive),
    check(
      'discount_type_check',
      sql`${table.discountType} IN ('hours_volume', 'days_volume', 'recurring', 'first_time')`,
    ),
    check(
      'discount_percentage_range_check',
      sql`${table.discountPercentage} >= 1 AND ${table.discountPercentage} <= 50`,
    ),
    check(
      'volume_threshold_check',
      sql`NOT (${table.discountType} IN ('hours_volume', 'days_volume') AND (${table.threshold} IS NULL OR ${table.threshold} <= 0))`,
    ),
    check(
      'non_volume_threshold_check',
      sql`NOT (${table.discountType} IN ('recurring', 'first_time') AND ${table.threshold} IS NOT NULL)`,
    ),
    uniqueIndex('uq_discount_rules_active')
      .on(table.providerId, table.serviceId, table.discountType)
      .where(sql`${table.isActive} = true`),
  ],
);
```

---

## 9. Business Rules & Invariants

### Quote Request Rules

| # | Rule | Enforcement |
|---|------|-------------|
| QR1 | A quote request must target a specific provider (provider_id is required). This distinguishes it from Task Posts (Path D) which are open to multiple providers. | Domain logic in `QuoteRequest.create()` |
| QR2 | The targeted service must accept custom quotes (`accepts_custom_quotes = true` or `pricing_mode = 'quote'`). | Use case validation via Catalog BC read model |
| QR3 | Quote requests expire 48 hours after creation if the provider does not respond. | `expires_at` auto-set in `QuoteRequest.create()` + scheduled `ExpireQuotes` job |
| QR4 | A customer can only cancel a request while it is in `pending` status (before the provider responds). | Domain logic in `QuoteRequest.cancel()` |
| QR5 | A customer cannot create multiple pending quote requests for the same provider + service combination. | Use case validation + partial unique index on DB |
| QR6 | Title must be 1-200 characters. Description must be 1-5000 characters. Images max 10 items. | Domain logic in `QuoteRequest.create()` + DB constraints |

### Quote Response Rules

| # | Rule | Enforcement |
|---|------|-------------|
| QRP1 | Only the provider who received the request can respond. | Use case authorization check |
| QRP2 | Each quote request can have at most one response. | DB UNIQUE constraint on `quote_request_id` |
| QRP3 | Price breakdown items must sum to the base amount. If a discount is applied, total_price = sum(items) - discount_amount. | Domain logic in `QuoteResponse.create()` |
| QRP4 | `total_price` must be > 0. | Domain logic + DB CHECK constraint |
| QRP5 | `valid_until` must be in the future at creation time. | Domain logic in `QuoteResponse.create()` |
| QRP6 | A quote response cannot be accepted after its `valid_until` has passed. | Domain logic in `QuoteResponse.accept()` |
| QRP7 | When a quote is accepted, Booking BC creates a Path C booking using the quote's price details as the pricing snapshot. | Event handler in Booking BC consuming `QuoteAccepted` |

### Discount Rule Rules

| # | Rule | Enforcement |
|---|------|-------------|
| DR1 | Maximum discount percentage is 50%. Minimum is 1%. | Domain logic + DB CHECK constraint |
| DR2 | Volume discount types (`hours_volume`, `days_volume`) require a threshold > 0. | Domain logic + DB CHECK constraint |
| DR3 | Non-volume discount types (`recurring`, `first_time`) must not have a threshold set. | Domain logic + DB CHECK constraint |
| DR4 | `first_time` discount checks if the customer has ANY previous completed booking with the provider. If yes, discount does not apply. | Price calculation logic queries booking history |
| DR5 | `recurring` discount applies automatically to all bookings that are part of a recurring series. | Price calculation logic checks `isRecurring` flag |
| DR6 | Discounts do NOT stack. When multiple rules are applicable, only the highest percentage discount is applied. | Price calculation algorithm selects max `discount_percentage` |
| DR7 | Cannot have duplicate active rules for the same provider + service + discount_type. | Use case validation + partial unique index on DB |
| DR8 | Rules with `service_id = null` (global) apply to all of the provider's services. Service-specific rules take precedence over global rules of the same type if both match. | Price calculation algorithm prefers service-specific rules |
| DR9 | Discount rules are provider-owned. Only the provider who created the rule can update or delete it. | Use case authorization check |

### Price Calculation Rules

| # | Rule | Enforcement |
|---|------|-------------|
| PC1 | Base amount is determined by the booking path: package fixed_price (Path A), hourly_rate * hours (Path B), or quote total_price (Path C). | `CalculatePrice` use case logic |
| PC2 | Discount rules are evaluated after the base amount is determined. | `CalculatePrice` use case algorithm (step 3 onward) |
| PC3 | Service-specific rules are preferred over global rules of the same discount type. If a service-specific rule matches, the global rule of the same type is ignored. | `CalculatePrice` use case algorithm |
| PC4 | Among all applicable discount rules (after filtering), the one with the highest `discount_percentage` is selected. | `CalculatePrice` use case algorithm (step 6) |
| PC5 | Discount amount is rounded to the nearest integer (smallest currency unit). | `Math.round()` in calculation |
| PC6 | Final amount can never be negative. If discount would exceed base amount, the discount is capped at base amount - 1. | Domain logic safeguard |

---

## 10. Cross-Context Dependencies

### Upstream Dependencies (Depends On)

| Source BC | What Pricing Needs | How It Gets It |
|-----------|-------------------|----------------|
| **User** | Provider identity (user_id, provider_type, verification_status) to validate that the provider receiving a quote request exists and is verified. Customer identity (user_id) to validate the requester. Organization identity for organization providers. | Queries User BC read models for provider and customer details. Subscribes to `ProviderVerified` to enable quote acceptance (verified providers only). Subscribes to `UserSuspended` to expire all pending quotes from/to suspended users. |
| **Catalog** | Service details (service_id, pricing_mode, accepts_custom_quotes, hourly_rate) to validate quote request eligibility and compute base prices. Package details (package_id, fixed_price) for Path A price calculations. Category information for contextual quote requests. | Queries Catalog BC read models for service and package data. Subscribes to `ServicePublished` to register the service in Pricing's local read model for quote eligibility and price calculation. Subscribes to `ServiceArchived` to expire pending quotes and disable quote requests for that service. |

### Downstream Dependents (Depended On By)

| Consuming BC | What It Needs | How It Gets It |
|-------------|---------------|----------------|
| **Booking** | Final calculated price (base amount, discount, total) for Path A, B, and D bookings. Accepted quote details (total_price, price_breakdown, discount info) for Path C bookings. | Booking BC calls `CalculatePrice` use case for Paths A, B, D. Booking BC consumes `QuoteAccepted` event to create Path C bookings with the quote's pricing snapshot. |
| **Communication** | Quote lifecycle events to trigger notifications and create conversation threads between customers and providers. | Communication BC consumes `QuoteRequested`, `QuoteResponded`, `QuoteAccepted`, `QuoteDeclined`, and `QuoteExpired` events. |

### Events Published

| Event | Consumers |
|-------|-----------|
| `QuoteRequested` | Communication BC (notify provider, create conversation thread) |
| `QuoteResponded` | Communication BC (notify customer with price summary) |
| `QuoteAccepted` | Booking BC (create Path C booking), Communication BC (notify provider) |
| `QuoteDeclined` | Communication BC (notify provider with reason) |
| `QuoteExpired` | Communication BC (notify both parties) |
| `DiscountApplied` | Booking BC (record discount in booking snapshot), Communication BC (notify customer of savings) |

### Events Subscribed

| Event | Source BC | Handler |
|-------|----------|---------|
| `ProviderVerified` | User | Updates local read model to mark the provider as eligible for quote responses. Providers must be verified before their quotes can be accepted. |
| `UserSuspended` | User | Expires all pending quote requests and quote responses involving the suspended user (as customer or provider). Prevents new interactions with suspended accounts. |
| `ServicePublished` | Catalog | Registers the service in Pricing BC's local read model. Stores `pricing_mode`, `accepts_custom_quotes`, `hourly_rate`, and `provider_id` for price calculation and quote eligibility checks. |
| `ServiceUnpublished` | Catalog | Marks the service as ineligible for new quote requests in the local read model. Existing pending quotes remain active until they expire or are resolved. |
| `ServiceArchived` | Catalog | Expires all pending quote requests for the archived service. Removes the service from the local read model. |
| `BookingCompleted` | Booking | Updates the local first-time tracking. Records that the customer has completed a booking with the provider, disqualifying them from future `first_time` discounts with that provider. |

### Integration Pattern

The Pricing BC uses the **Conformist** pattern upstream: it conforms to User BC's model for customer and provider identity, and to Catalog BC's model for service details, pricing mode, and package information. It maintains a lightweight local read model of service data (synced via domain events) to avoid synchronous queries during price calculation.

Downstream, it uses the **Published Language** pattern, exposing well-defined domain events and a `CalculatePrice` use case that the Booking BC invokes through a defined port. The Booking BC never writes directly to Pricing's data store. When a quote is accepted, Pricing publishes a `QuoteAccepted` event that Booking BC consumes to create the booking; the quote's price breakdown becomes an immutable snapshot within the booking record.

The Communication BC acts as a supporting context, consuming all quote lifecycle events to manage notifications and conversation threads. Pricing does not depend on Communication; the relationship is unidirectional through events.
