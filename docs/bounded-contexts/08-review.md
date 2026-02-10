# Review Bounded Context

## 1. Overview

The Review Bounded Context manages customer-to-provider and provider-to-customer ratings and written feedback following completed bookings. It is a small, focused downstream BC that enforces review eligibility rules, stores immutable review data, and publishes events consumed by User BC (rating aggregation) and Communication BC (notifications).

**Owns:**
- Customer reviews of providers/organizations (1-5 star rating, optional sub-ratings, text)
- Provider reviews of customers (1-5 star rating)
- Provider responses to customer reviews (one response per review)
- Review eligibility enforcement (completed booking, 7-day window)
- Review reporting (inappropriate content flagging)

**Delegates:**
- User identity and profile data to **User BC**
- Booking completion status to **Booking BC**
- Review notification delivery to **Communication BC**

**Key Design Principles:**
- Reviews are immutable once submitted -- no edits allowed
- Only one customer review and one provider review per booking
- Reviews require a completed booking within a 7-day submission window
- Sub-ratings (punctuality, quality, communication) are optional; overall rating is required
- Customer review text is capped at 500 characters
- Provider response is capped at 500 characters, one response per review
- The Review BC publishes `ReviewSubmitted` which User BC consumes to recalculate aggregate ratings on `Profile.average_rating` and `Organization.average_rating`

---

## 2. Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Review** | A rating and optional text feedback submitted by a customer about a provider (or by a provider about a customer) after a completed booking. The single aggregate root of this BC. |
| **Overall Rating** | A required integer score from 1 to 5 representing general satisfaction. |
| **Sub-Rating** | An optional integer score from 1 to 5 for a specific quality dimension: punctuality, quality, or communication. Only available on customer-to-provider reviews. |
| **Review Text** | An optional written comment (max 500 characters) that accompanies a customer-to-provider review. |
| **Provider Response** | A single text reply (max 500 characters) that the reviewed provider can attach to a customer review. Once submitted, it cannot be edited or removed. |
| **Review Direction** | Whether the review is `customer_to_provider` or `provider_to_customer`. Determines which fields are available. |
| **Review Window** | The 7-day period after a booking is completed during which reviews can be submitted. After this window closes, reviews can no longer be created for that booking. |
| **Review Report** | A user-submitted flag indicating a review contains inappropriate, abusive, or false content. Triggers admin moderation. |
| **Report Status** | The moderation state of a reported review: `pending` (awaiting admin review), `dismissed` (report rejected), `upheld` (review hidden). |

---

## 3. Aggregates & Entities

### 3.1 Review Aggregate

**Aggregate Root:** `Review`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `booking_id` | `UUID` | FK -> bookings. Required |
| `reviewer_id` | `UUID` | FK -> users. The person submitting the review |
| `reviewee_id` | `UUID` | FK -> users. The person being reviewed |
| `organization_id` | `UUID \| null` | FK -> organizations. Set when reviewing an organization provider |
| `direction` | `ReviewDirection` | Enum: `customer_to_provider`, `provider_to_customer`. Required |
| `overall_rating` | `number` | Integer 1-5. Required |
| `punctuality_rating` | `number \| null` | Integer 1-5. Only for `customer_to_provider` |
| `quality_rating` | `number \| null` | Integer 1-5. Only for `customer_to_provider` |
| `communication_rating` | `number \| null` | Integer 1-5. Only for `customer_to_provider` |
| `text` | `string \| null` | Max 500 chars. Only for `customer_to_provider` |
| `provider_response` | `string \| null` | Max 500 chars. Only on `customer_to_provider` reviews |
| `provider_response_at` | `Date \| null` | Set when provider responds |
| `is_reported` | `boolean` | Default false |
| `report_reason` | `string \| null` | Max 500 chars |
| `reported_at` | `Date \| null` | Set when reported |
| `reported_by` | `UUID \| null` | FK -> users. The person who reported |
| `report_status` | `ReportStatus \| null` | Enum: `pending`, `dismissed`, `upheld`. Set on report |
| `is_visible` | `boolean` | Default true. Set to false when report is upheld |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set, updated on mutation |

#### Invariants

1. `overall_rating` must be an integer between 1 and 5.
2. Sub-ratings (`punctuality_rating`, `quality_rating`, `communication_rating`) must be integers between 1 and 5 when provided.
3. Sub-ratings and `text` are only allowed on `customer_to_provider` reviews.
4. `provider_response` is only allowed on `customer_to_provider` reviews.
5. A review is immutable after creation -- rating values, text, and direction cannot be changed.
6. A provider can respond to a review only once. Once `provider_response` is set, it cannot be modified.
7. Only the reviewee (provider) can submit a `provider_response`.
8. A review can only be reported once. Once `is_reported` is true, it cannot be reported again.
9. A review can only be reported by the reviewee, not the reviewer.
10. Only one `customer_to_provider` review and one `provider_to_customer` review can exist per booking.

#### Domain Logic

```typescript
import { Entity, DomainError } from 'onion-lasagna';

type ReviewDirection = 'customer_to_provider' | 'provider_to_customer';
type ReportStatus = 'pending' | 'dismissed' | 'upheld';

const MAX_TEXT_LENGTH = 500;
const MAX_RESPONSE_LENGTH = 500;
const MIN_RATING = 1;
const MAX_RATING = 5;
const REVIEW_WINDOW_DAYS = 7;

interface ReviewProps {
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  organizationId: string | null;
  direction: ReviewDirection;
  overallRating: number;
  punctualityRating: number | null;
  qualityRating: number | null;
  communicationRating: number | null;
  text: string | null;
  providerResponse: string | null;
  providerResponseAt: Date | null;
  isReported: boolean;
  reportReason: string | null;
  reportedAt: Date | null;
  reportedBy: string | null;
  reportStatus: ReportStatus | null;
  isVisible: boolean;
}

class Review extends Entity<ReviewProps> {
  static create(props: {
    bookingId: string;
    reviewerId: string;
    revieweeId: string;
    organizationId: string | null;
    direction: ReviewDirection;
    overallRating: number;
    punctualityRating?: number | null;
    qualityRating?: number | null;
    communicationRating?: number | null;
    text?: string | null;
    bookingCompletedAt: Date;
  }): Review {
    Review.validateRating(props.overallRating, 'Overall rating');
    Review.validateReviewWindow(props.bookingCompletedAt);

    if (props.direction === 'provider_to_customer') {
      if (props.punctualityRating || props.qualityRating || props.communicationRating) {
        throw new DomainError('Sub-ratings are not allowed on provider-to-customer reviews');
      }
      if (props.text) {
        throw new DomainError('Text is not allowed on provider-to-customer reviews');
      }
    }

    if (props.direction === 'customer_to_provider') {
      if (props.punctualityRating != null) Review.validateRating(props.punctualityRating, 'Punctuality rating');
      if (props.qualityRating != null) Review.validateRating(props.qualityRating, 'Quality rating');
      if (props.communicationRating != null) Review.validateRating(props.communicationRating, 'Communication rating');
      if (props.text && props.text.length > MAX_TEXT_LENGTH) {
        throw new DomainError(`Review text must not exceed ${MAX_TEXT_LENGTH} characters`);
      }
    }

    const review = new Review({
      bookingId: props.bookingId,
      reviewerId: props.reviewerId,
      revieweeId: props.revieweeId,
      organizationId: props.organizationId,
      direction: props.direction,
      overallRating: props.overallRating,
      punctualityRating: props.direction === 'customer_to_provider' ? (props.punctualityRating ?? null) : null,
      qualityRating: props.direction === 'customer_to_provider' ? (props.qualityRating ?? null) : null,
      communicationRating: props.direction === 'customer_to_provider' ? (props.communicationRating ?? null) : null,
      text: props.direction === 'customer_to_provider' ? (props.text ?? null) : null,
      providerResponse: null,
      providerResponseAt: null,
      isReported: false,
      reportReason: null,
      reportedAt: null,
      reportedBy: null,
      reportStatus: null,
      isVisible: true,
    });

    review.addDomainEvent(new ReviewSubmitted(
      review.id,
      props.bookingId,
      props.reviewerId,
      props.revieweeId,
      props.organizationId,
      props.direction,
      props.overallRating,
    ));

    return review;
  }

  addProviderResponse(providerId: string, responseText: string): void {
    if (this.props.direction !== 'customer_to_provider') {
      throw new DomainError('Provider responses are only allowed on customer-to-provider reviews');
    }
    if (providerId !== this.props.revieweeId) {
      throw new DomainError('Only the reviewed provider can respond');
    }
    if (this.props.providerResponse !== null) {
      throw new DomainError('Provider has already responded to this review');
    }
    if (!responseText || responseText.length > MAX_RESPONSE_LENGTH) {
      throw new DomainError(`Response must be between 1 and ${MAX_RESPONSE_LENGTH} characters`);
    }
    this.props.providerResponse = responseText;
    this.props.providerResponseAt = new Date();
    this.addDomainEvent(new ProviderResponseAdded(this.id, providerId));
  }

  report(reporterId: string, reason: string): void {
    if (this.props.isReported) {
      throw new DomainError('Review has already been reported');
    }
    if (reporterId === this.props.reviewerId) {
      throw new DomainError('Cannot report your own review');
    }
    if (reporterId !== this.props.revieweeId) {
      throw new DomainError('Only the reviewee can report a review');
    }
    if (!reason || reason.length > MAX_TEXT_LENGTH) {
      throw new DomainError(`Report reason must be between 1 and ${MAX_TEXT_LENGTH} characters`);
    }
    this.props.isReported = true;
    this.props.reportReason = reason;
    this.props.reportedAt = new Date();
    this.props.reportedBy = reporterId;
    this.props.reportStatus = 'pending';
    this.addDomainEvent(new ReviewReported(this.id, reporterId, reason));
  }

  dismissReport(adminId: string): void {
    if (!this.props.isReported || this.props.reportStatus !== 'pending') {
      throw new DomainError('No pending report to dismiss');
    }
    this.props.reportStatus = 'dismissed';
    this.markUpdated();
  }

  upholdReport(adminId: string): void {
    if (!this.props.isReported || this.props.reportStatus !== 'pending') {
      throw new DomainError('No pending report to uphold');
    }
    this.props.reportStatus = 'upheld';
    this.props.isVisible = false;
    this.markUpdated();
    this.addDomainEvent(new ReviewHidden(this.id, this.props.reviewerId, this.props.revieweeId));
  }

  private static validateRating(value: number, label: string): void {
    if (!Number.isInteger(value) || value < MIN_RATING || value > MAX_RATING) {
      throw new DomainError(`${label} must be an integer between ${MIN_RATING} and ${MAX_RATING}`);
    }
  }

  private static validateReviewWindow(bookingCompletedAt: Date): void {
    const windowEnd = new Date(bookingCompletedAt.getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnd) {
      throw new DomainError(`Review window has expired. Reviews must be submitted within ${REVIEW_WINDOW_DAYS} days of booking completion`);
    }
  }
}
```

---

## 4. Value Objects

```typescript
const ReviewDirection = {
  CUSTOMER_TO_PROVIDER: 'customer_to_provider',
  PROVIDER_TO_CUSTOMER: 'provider_to_customer',
} as const;
type ReviewDirection = (typeof ReviewDirection)[keyof typeof ReviewDirection];

const ReportStatus = {
  PENDING: 'pending',
  DISMISSED: 'dismissed',
  UPHELD: 'upheld',
} as const;
type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];
```

Additional value objects: `ReviewId` (UUID wrapper), `Rating` (integer 1-5 with validation), `ReviewText` (string with max 500 char validation), `ResponseText` (string with max 500 char validation).

```typescript
class Rating {
  private constructor(private readonly value: number) {}

  static create(value: number): Rating {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new DomainError('Rating must be an integer between 1 and 5');
    }
    return new Rating(value);
  }

  toNumber(): number {
    return this.value;
  }

  equals(other: Rating): boolean {
    return this.value === other.value;
  }
}
```

---

## 5. Domain Events

| Event | Trigger | Key Payload | Handlers |
|-------|---------|-------------|----------|
| `ReviewSubmitted` | Customer or provider submits a review | reviewId, bookingId, reviewerId, revieweeId, organizationId, direction, overallRating | **User BC**: recalculate `average_rating` and `total_reviews` on Profile or Organization. **Communication BC**: send `new_review` notification to reviewee |
| `ProviderResponseAdded` | Provider responds to a customer review | reviewId, providerId | **Communication BC**: notify customer that provider responded |
| `ReviewReported` | Reviewee reports a review | reviewId, reporterId, reason | **Admin**: flag for moderation |
| `ReviewHidden` | Admin upholds a report, hiding the review | reviewId, reviewerId, revieweeId | **User BC**: recalculate ratings excluding hidden review. **Communication BC**: notify reviewer that review was hidden |

---

## 6. Use Cases

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **SubmitCustomerReview** | Customer | bookingId, reviewerId, overallRating, punctualityRating?, qualityRating?, communicationRating?, text? | Review | ReviewSubmitted | BookingNotFound, BookingNotCompleted, ReviewWindowExpired, AlreadyReviewed, NotBookingCustomer, ValidationError |
| **SubmitProviderReview** | Provider | bookingId, reviewerId, overallRating | Review | ReviewSubmitted | BookingNotFound, BookingNotCompleted, ReviewWindowExpired, AlreadyReviewed, NotBookingProvider, ValidationError |
| **AddProviderResponse** | Provider | reviewId, providerId, responseText | Updated Review | ProviderResponseAdded | ReviewNotFound, NotReviewee, AlreadyResponded, NotCustomerReview, ValidationError |
| **ReportReview** | Reviewee | reviewId, reporterId, reason | Updated Review | ReviewReported | ReviewNotFound, NotReviewee, AlreadyReported, OwnReview, ValidationError |
| **ModerateReport** | Admin | reviewId, adminId, decision (dismiss/uphold) | Updated Review | ReviewHidden? | ReviewNotFound, NoPendingReport, Unauthorized |
| **GetReviewsByProvider** | Any | providerId, pagination | Review[] (visible only) | -- | -- |
| **GetReviewsByOrganization** | Any | organizationId, pagination | Review[] (visible only) | -- | -- |
| **GetReviewsByBooking** | Customer or Provider | bookingId | Review[] | -- | BookingNotFound |
| **GetReviewsByCustomer** | Provider or Admin | customerId, pagination | Review[] (provider_to_customer, visible) | -- | -- |
| **GetPendingReports** | Admin | pagination | Review[] (reportStatus = pending) | -- | Unauthorized |

---

## 7. Repository Ports

```typescript
interface ReviewRepository {
  findById(id: string): Promise<Review | null>;
  findByBookingAndDirection(bookingId: string, direction: ReviewDirection): Promise<Review | null>;
  findByReviewee(revieweeId: string, pagination: { limit: number; offset: number }): Promise<{ reviews: Review[]; total: number }>;
  findByOrganization(organizationId: string, pagination: { limit: number; offset: number }): Promise<{ reviews: Review[]; total: number }>;
  findByBooking(bookingId: string): Promise<Review[]>;
  findByReviewer(reviewerId: string, pagination: { limit: number; offset: number }): Promise<{ reviews: Review[]; total: number }>;
  findVisibleByReviewee(revieweeId: string, pagination: { limit: number; offset: number }): Promise<{ reviews: Review[]; total: number }>;
  findVisibleByOrganization(organizationId: string, pagination: { limit: number; offset: number }): Promise<{ reviews: Review[]; total: number }>;
  findPendingReports(pagination: { limit: number; offset: number }): Promise<{ reviews: Review[]; total: number }>;
  calculateAverageRating(revieweeId: string): Promise<{ average: number; total: number }>;
  calculateOrganizationAverageRating(organizationId: string): Promise<{ average: number; total: number }>;
  save(review: Review): Promise<void>;
}
```

### External Query Ports (Read Models from Other BCs)

```typescript
/**
 * Queries Booking BC to validate review eligibility.
 * Implemented as ACL adapter querying Booking read models.
 */
interface BookingQueryService {
  getCompletedBooking(bookingId: string): Promise<{
    id: string;
    customerId: string;
    providerId: string;
    organizationId: string | null;
    status: string;
    completedAt: Date;
  } | null>;
}
```

---

## 8. Entity Schemas

### Drizzle ORM Schema

```typescript
import {
  pgTable, uuid, varchar, text, boolean, timestamp,
  integer, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id').notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    revieweeId: uuid('reviewee_id').notNull(),
    organizationId: uuid('organization_id'),
    direction: varchar('direction', { length: 30 }).notNull(),
    overallRating: integer('overall_rating').notNull(),
    punctualityRating: integer('punctuality_rating'),
    qualityRating: integer('quality_rating'),
    communicationRating: integer('communication_rating'),
    text: varchar('text', { length: 500 }),
    providerResponse: varchar('provider_response', { length: 500 }),
    providerResponseAt: timestamp('provider_response_at', { withTimezone: true }),
    isReported: boolean('is_reported').notNull().default(false),
    reportReason: varchar('report_reason', { length: 500 }),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    reportedBy: uuid('reported_by'),
    reportStatus: varchar('report_status', { length: 20 }),
    isVisible: boolean('is_visible').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_reviews_booking').on(table.bookingId),
    index('idx_reviews_reviewer').on(table.reviewerId),
    index('idx_reviews_reviewee').on(table.revieweeId),
    index('idx_reviews_organization').on(table.organizationId),
    index('idx_reviews_direction').on(table.direction),
    index('idx_reviews_visible').on(table.isVisible),
    index('idx_reviews_report_status').on(table.reportStatus),
    index('idx_reviews_created_at').on(table.createdAt),
    uniqueIndex('uq_reviews_booking_direction').on(table.bookingId, table.direction),
    check('direction_check', sql`${table.direction} IN ('customer_to_provider','provider_to_customer')`),
    check('overall_rating_check', sql`${table.overallRating} >= 1 AND ${table.overallRating} <= 5`),
    check('punctuality_rating_check', sql`${table.punctualityRating} IS NULL OR (${table.punctualityRating} >= 1 AND ${table.punctualityRating} <= 5)`),
    check('quality_rating_check', sql`${table.qualityRating} IS NULL OR (${table.qualityRating} >= 1 AND ${table.qualityRating} <= 5)`),
    check('communication_rating_check', sql`${table.communicationRating} IS NULL OR (${table.communicationRating} >= 1 AND ${table.communicationRating} <= 5)`),
    check('report_status_check', sql`${table.reportStatus} IS NULL OR ${table.reportStatus} IN ('pending','dismissed','upheld')`),
    check('text_length_check', sql`${table.text} IS NULL OR length(${table.text}) <= 500`),
    check('response_length_check', sql`${table.providerResponse} IS NULL OR length(${table.providerResponse}) <= 500`),
  ],
);
```

---

## 9. Business Rules & Invariants

| # | Rule | Enforcement |
|---|------|-------------|
| REV1 | A review can only be submitted for a booking with status `completed`. | `SubmitCustomerReview` / `SubmitProviderReview` use case validates booking status via `BookingQueryService`. |
| REV2 | Reviews must be submitted within 7 days of booking completion. | Domain validation in `Review.create()` via `validateReviewWindow()`. |
| REV3 | Only one `customer_to_provider` review and one `provider_to_customer` review per booking. | DB unique constraint on (`booking_id`, `direction`) + use case existence check. |
| REV4 | The reviewer for a `customer_to_provider` review must be the booking's customer. The reviewer for a `provider_to_customer` review must be the booking's provider. | Use case validates reviewer identity against booking participant roles. |
| REV5 | Reviews are immutable after creation. Rating values, text, and direction cannot be changed. | No update methods on Review entity for rating/text fields. Entity only exposes `addProviderResponse`, `report`, `dismissReport`, `upholdReport`. |
| REV6 | Overall rating is required (integer 1-5). Sub-ratings are optional and only allowed on `customer_to_provider` reviews. | Domain validation in `Review.create()`. DB CHECK constraints. |
| REV7 | Review text (max 500 chars) is only allowed on `customer_to_provider` reviews. | Domain validation in `Review.create()`. DB CHECK constraint. |
| REV8 | A provider can respond to a customer review exactly once. The response cannot be edited or deleted. | Domain logic in `addProviderResponse()` checks `providerResponse !== null`. |
| REV9 | Only the reviewee (the reviewed provider) can submit a provider response. | Domain logic in `addProviderResponse()` validates `providerId === revieweeId`. |
| REV10 | A review can only be reported by the reviewee, not by the reviewer or third parties. | Domain logic in `report()` validates `reporterId === revieweeId`. |
| REV11 | A review can only be reported once. | Domain logic in `report()` checks `isReported === false`. |
| REV12 | When an admin upholds a report, the review becomes hidden (`is_visible = false`) and is excluded from rating calculations. | Domain logic in `upholdReport()`. User BC recalculates on `ReviewHidden` event. |
| REV13 | The `ReviewSubmitted` event triggers User BC to recalculate `average_rating` and `total_reviews` on `Profile` (for individual providers) or `Organization` (for organization providers). | Event handler in User BC consumes `ReviewSubmitted`. |
| REV14 | Only visible reviews (`is_visible = true`) are included in average rating calculations and public listings. | Repository query filters and `calculateAverageRating` methods filter by `is_visible = true`. |

---

## 10. Cross-Context Dependencies

### Upstream Dependencies (Depends On)

| Source BC | What Review Needs | How It Gets It |
|-----------|-------------------|----------------|
| **User** | Reviewer and reviewee identity (userId). Provider/organization association for determining `organization_id`. | Queries User BC read models at review submission time to resolve identities. |
| **Booking** | Booking completion status and completion timestamp to validate review eligibility. Customer and provider participant IDs. | Queries Booking BC via `BookingQueryService` port. Consumes `BookingCompleted` event to open review windows. |

### Downstream Dependents (Depended On By)

| Consuming BC | What It Needs | How It Gets It |
|-------------|---------------|----------------|
| **User** | Review ratings to update `Profile.average_rating`, `Profile.total_reviews`, `Organization.average_rating`, `Organization.total_reviews`. | Consumes `ReviewSubmitted` and `ReviewHidden` events. |
| **Communication** | Review submission and response events for notification dispatch. | Consumes `ReviewSubmitted`, `ProviderResponseAdded`, `ReviewHidden` events. |

### Events Published

| Event | Consumers |
|-------|-----------|
| `ReviewSubmitted` | User BC (recalculate ratings), Communication BC (notify reviewee) |
| `ProviderResponseAdded` | Communication BC (notify customer of provider response) |
| `ReviewReported` | Internal admin moderation queue |
| `ReviewHidden` | User BC (recalculate ratings excluding hidden review), Communication BC (notify reviewer) |

### Events Subscribed

| Event | Source BC | Handler |
|-------|----------|---------|
| `BookingCompleted` | Booking | Cache booking completion data (bookingId, customerId, providerId, organizationId, completedAt) in a local read model for review eligibility checks. |

### Integration Pattern

The Review BC uses the **Conformist** pattern with both upstream BCs. It accepts the User BC's identity model and the Booking BC's completion model as-is. For querying booking data, Review uses a `BookingQueryService` port with an adapter that reads from Booking BC's read models, keeping a lightweight **Anti-Corruption Layer** to translate booking data into the minimal shape needed for review eligibility validation.

Review BC is a near-terminal leaf in the context map. It publishes events consumed only by User BC (rating aggregation) and Communication BC (notifications). It has no complex downstream orchestration responsibilities.
