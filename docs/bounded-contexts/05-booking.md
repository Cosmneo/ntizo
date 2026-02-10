# Booking Bounded Context

## 1. Overview

The Booking Bounded Context is the **central orchestrator** of the Ntizo service marketplace platform. It coordinates User, Catalog, Scheduling, Pricing, and Payment to manage the full booking lifecycle, recurring booking series, task-based bidding, and subscription services.

**Owns:**
- Booking creation and lifecycle management across 4 booking paths
- Booking recurrence management (weekly, biweekly, monthly series)
- Task posting and competitive bidding (Path D)
- Subscription plans, active subscriptions, and subscription billing
- Immutable booking snapshots (price, service, slot details captured at creation)

**Delegates:**
- Slot availability and reservation to **Scheduling BC**
- Price calculation and discount application to **Pricing BC**
- Payment processing and escrow to **Payment BC** (partnership)
- Notifications and messaging to **Communication BC**
- Review eligibility to **Review BC**

**Key Design Principles:**
- 4 Booking Paths: Package (A), Hourly (B), Custom Quote (C), Task Bid (D)
- 3 Engagement Modes: One-Time, Recurring, Subscription
- Each booking captures an immutable snapshot at creation time (service name, package details, slot time, pricing breakdown)
- Provider acceptance timeout: 24 hours. Payment timeout: 30 minutes. Customer confirmation timeout: 24 hours after completion.
- Recurring bookings generate independent booking instances; each follows its own lifecycle
- Subscriptions lock price at subscription time (grandfathering) with auto-billing

---

## 2. Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Booking** | A confirmed or pending service engagement between a customer and a provider. The core aggregate of this BC. |
| **Booking Path** | The method by which a booking is created: `package` (Path A, fixed-price package), `hourly` (Path B, time-based), `custom_quote` (Path C, from accepted quote), `task_bid` (Path D, from accepted bid). |
| **Booking Status** | The lifecycle state: `pending`, `pending_payment`, `confirmed`, `in_progress`, `completed`, `cancelled`, `disputed`, `expired`. |
| **Booking Snapshot** | An immutable JSON capture of service details, package info, slot time, and pricing breakdown at booking creation. Ensures historical accuracy even if the source data changes later. |
| **Engagement Mode** | How the service engagement is structured: `one_time` (single booking), `recurring` (repeating series), `subscription` (ongoing auto-billed). |
| **Booking Recurrence** | A pattern definition for repeating bookings (weekly, biweekly, monthly). Generates individual Booking instances that each follow independent lifecycles. |
| **Task Post** | A customer-published request for competitive provider bids. Open to multiple providers, unlike quotes which target one provider. |
| **Bid** | A provider's proposal on a task post, including proposed price, message, and optional alternative date/time. |
| **Subscription Plan** | A provider-defined ongoing service offering with a recurring price (monthly, quarterly, annual). |
| **Service Subscription** | A customer's active subscription to a plan, with locked pricing and auto-billing. |
| **Subscription Billing** | A per-cycle billing record tracking payment status, retries, and amounts for a subscription. |
| **Provider Acceptance** | The provider's decision to accept or decline a pending booking. Times out after 24 hours. |
| **Customer Confirmation** | The customer's acknowledgment that a completed booking was satisfactorily delivered. Auto-confirms after 24 hours. |
| **Payment Timeout** | The 30-minute window (configurable) for a customer to complete payment after provider acceptance. |

---

## 3. Aggregates & Entities

### 3.1 Booking Aggregate

**Aggregate Root:** `Booking`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `customer_id` | `UUID` | FK -> users. Required |
| `provider_type` | `ProviderType` | Enum: `individual`, `organization`. Required |
| `provider_id` | `UUID \| null` | FK -> users. Set when provider_type = individual |
| `organization_id` | `UUID \| null` | FK -> organizations. Set when provider_type = organization |
| `staff_member_id` | `UUID \| null` | FK -> organization_members. For organization bookings with staff assignment |
| `service_id` | `UUID \| null` | FK -> services. Nullable (Path D may not have a service) |
| `package_id` | `UUID \| null` | FK -> service_packages. Required for Path A |
| `task_id` | `UUID \| null` | FK -> task_posts. Required for Path D |
| `bid_id` | `UUID \| null` | FK -> bids. Required for Path D |
| `quote_response_id` | `UUID \| null` | FK -> quote_responses. Required for Path C |
| `recurrence_id` | `UUID \| null` | FK -> booking_recurrences. Set for recurring bookings |
| `slot_id` | `UUID \| null` | FK -> slots. Set on confirmation (after slot reservation). Nullable for Path C/D if no slot |
| `booking_path` | `BookingPath` | Enum: `package`, `hourly`, `custom_quote`, `task_bid`. Required |
| `service_location` | `ServiceLocation` | Enum: `at_customer`, `at_provider`, `remote`. Required |
| `scheduled_date` | `Date` | Required |
| `scheduled_start_time` | `string` | HH:mm format. Required |
| `scheduled_end_time` | `string` | HH:mm format. Required |
| `estimated_duration_minutes` | `number` | Required |
| `actual_duration_minutes` | `number \| null` | Set on completion for hourly bookings |
| `location_address` | `string \| null` | Required for at_customer and at_provider |
| `location_lat` | `number \| null` | Latitude |
| `location_lng` | `number \| null` | Longitude |
| `description` | `string \| null` | Customer notes, max 2000 chars |
| `base_amount` | `number` | Stored in smallest currency unit (cents). Required |
| `discount_amount` | `number` | Default 0 |
| `total_amount` | `number` | base_amount - discount_amount. Required |
| `currency` | `string` | ISO 4217, 3 chars. Required |
| `platform_fee` | `number` | Platform commission. Required |
| `provider_earnings` | `number` | total_amount - platform_fee. Required |
| `tip_amount` | `number` | Default 0 |
| `snapshot` | `JSON` | Immutable booking snapshot. Required |
| `status` | `BookingStatus` | Default `pending` |
| `payment_expires_at` | `Date \| null` | Set when status transitions to pending_payment |
| `started_at` | `Date \| null` | Set when provider starts service |
| `completed_at` | `Date \| null` | Set when provider marks complete |
| `customer_confirmed_at` | `Date \| null` | Set on customer confirmation or auto-confirm |
| `cancelled_at` | `Date \| null` | Set on cancellation |
| `cancellation_reason` | `string \| null` | Reason for cancellation |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### Status State Machine

```
                         ┌───────────────┐
                         │    PENDING    │
                         └───────┬───────┘
                    accept()     │     decline() / timeout 24h
                  ┌──────────────┼──────────────┐
                  v                              v
         ┌────────────────┐              ┌────────────┐
         │PENDING_PAYMENT │              │ CANCELLED  │
         └───────┬────────┘              └────────────┘
    payment ok   │   timeout 30min / payment fails
          ┌──────┼──────┐
          v             v
   ┌───────────┐  ┌──────────┐
   │ CONFIRMED │  │ EXPIRED  │
   └─────┬─────┘  └──────────┘
         │ cancel (before start)
         ├─────────────────────► CANCELLED
         │
         v start()
   ┌────────────┐
   │IN_PROGRESS │
   └─────┬──────┘
         v complete()
   ┌───────────┐
   │ COMPLETED │──── dispute (within 24h) ──► DISPUTED
   └───────────┘
         │
         v confirm / auto-confirm 24h
   [Payout released]
```

#### Invariants

1. `booking_path` determines required FKs: Path A requires `package_id`, Path B requires `service_id`, Path C requires `quote_response_id`, Path D requires `task_id` + `bid_id`.
2. `provider_type = individual` requires `provider_id`; `provider_type = organization` requires `organization_id`.
3. `total_amount = base_amount - discount_amount`.
4. `platform_fee + provider_earnings = total_amount`.
5. `snapshot` is immutable after creation.
6. Status transitions must follow the state machine strictly.
7. Cannot cancel a completed booking. Can only dispute within 24h of completion.
8. `base_amount` must be > 0. `discount_amount` must be >= 0 and < `base_amount`.

#### Domain Logic (Key Methods)

```typescript
import { Entity, DomainError } from 'onion-lasagna';

type BookingPath = 'package' | 'hourly' | 'custom_quote' | 'task_bid';
type BookingStatus = 'pending' | 'pending_payment' | 'confirmed' | 'in_progress'
  | 'completed' | 'cancelled' | 'disputed' | 'expired';
type ServiceLocation = 'at_customer' | 'at_provider' | 'remote';
type ProviderType = 'individual' | 'organization';

const PROVIDER_ACCEPTANCE_TIMEOUT_HOURS = 24;
const PAYMENT_TIMEOUT_MINUTES = 30;
const CUSTOMER_CONFIRMATION_TIMEOUT_HOURS = 24;

interface BookingSnapshot {
  serviceName: string;
  packageName: string | null;
  packageIncludes: string[] | null;
  slotDate: string;
  slotStartTime: string;
  slotEndTime: string;
  durationMinutes: number;
  baseAmount: number;
  discountAmount: number;
  discountDescription: string | null;
  totalAmount: number;
  currency: string;
  providerName: string;
  organizationName: string | null;
  staffMemberName: string | null;
}

interface BookingProps {
  customerId: string;
  providerType: ProviderType;
  providerId: string | null;
  organizationId: string | null;
  staffMemberId: string | null;
  serviceId: string | null;
  packageId: string | null;
  taskId: string | null;
  bidId: string | null;
  quoteResponseId: string | null;
  recurrenceId: string | null;
  slotId: string | null;
  bookingPath: BookingPath;
  serviceLocation: ServiceLocation;
  scheduledDate: Date;
  scheduledStartTime: string;
  scheduledEndTime: string;
  estimatedDurationMinutes: number;
  actualDurationMinutes: number | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  description: string | null;
  baseAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  platformFee: number;
  providerEarnings: number;
  tipAmount: number;
  snapshot: BookingSnapshot;
  status: BookingStatus;
  paymentExpiresAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  customerConfirmedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

class Booking extends Entity<BookingProps> {
  accept(providerId: string): void {
    this.assertProviderOwnership(providerId);
    this.assertStatus('pending');
    this.props.status = 'pending_payment';
    this.props.paymentExpiresAt = new Date(
      Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000
    );
    this.markUpdated();
    this.addDomainEvent(new BookingPendingPayment(this.id, this.props.customerId, this.props.totalAmount, this.props.currency));
  }

  decline(providerId: string, reason: string): void {
    this.assertProviderOwnership(providerId);
    this.assertStatus('pending');
    this.props.status = 'cancelled';
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = reason;
    this.markUpdated();
    this.addDomainEvent(new BookingCancelled(this.id, this.props.customerId, 'provider_declined', reason));
  }

  confirmPayment(): void {
    this.assertStatus('pending_payment');
    this.props.status = 'confirmed';
    this.markUpdated();
    this.addDomainEvent(new BookingConfirmed(this.id, this.props.customerId));
  }

  start(providerId: string): void {
    this.assertProviderOwnership(providerId);
    this.assertStatus('confirmed');
    this.props.status = 'in_progress';
    this.props.startedAt = new Date();
    this.markUpdated();
    this.addDomainEvent(new BookingStarted(this.id, this.props.customerId));
  }

  complete(providerId: string, actualDurationMinutes?: number): void {
    this.assertProviderOwnership(providerId);
    this.assertStatus('in_progress');
    this.props.status = 'completed';
    this.props.completedAt = new Date();
    if (actualDurationMinutes !== undefined) {
      this.props.actualDurationMinutes = actualDurationMinutes;
    }
    this.markUpdated();
    this.addDomainEvent(new BookingCompleted(this.id, this.props.customerId));
  }

  confirmCompletion(customerId: string): void {
    if (this.props.customerId !== customerId) {
      throw new DomainError('Only the booking customer can confirm completion');
    }
    this.assertStatus('completed');
    this.props.customerConfirmedAt = new Date();
    this.markUpdated();
  }

  dispute(customerId: string, reason: string): void {
    if (this.props.customerId !== customerId) {
      throw new DomainError('Only the booking customer can dispute');
    }
    this.assertStatus('completed');
    const hoursSinceCompletion = (Date.now() - this.props.completedAt!.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCompletion > CUSTOMER_CONFIRMATION_TIMEOUT_HOURS) {
      throw new DomainError('Dispute window has expired (24 hours after completion)');
    }
    this.props.status = 'disputed';
    this.markUpdated();
    this.addDomainEvent(new BookingDisputed(this.id, this.props.customerId, reason));
  }

  cancel(userId: string, reason: string): void {
    const cancellableStatuses: BookingStatus[] = ['pending', 'pending_payment', 'confirmed'];
    if (!cancellableStatuses.includes(this.props.status)) {
      throw new DomainError(`Cannot cancel booking in '${this.props.status}' status. Must be pending, pending_payment, or confirmed.`);
    }
    this.props.status = 'cancelled';
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = reason;
    this.markUpdated();
    this.addDomainEvent(new BookingCancelled(this.id, this.props.customerId, 'user_cancelled', reason));
  }

  expire(): void {
    this.assertStatus('pending_payment');
    this.props.status = 'expired';
    this.markUpdated();
    this.addDomainEvent(new BookingExpired(this.id, this.props.customerId));
  }

  private assertStatus(expected: BookingStatus): void {
    if (this.props.status !== expected) {
      throw new DomainError(`Expected status '${expected}', got '${this.props.status}'`);
    }
  }

  private assertProviderOwnership(providerId: string): void {
    const isOwner = this.props.providerId === providerId
      || this.props.staffMemberId === providerId;
    if (!isOwner) {
      throw new DomainError('Caller is not the provider for this booking');
    }
  }
}
```

---

### 3.2 BookingRecurrence Aggregate

**Aggregate Root:** `BookingRecurrence`
**Children:** None (references Booking records via `recurrence_id`)

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `customer_id` | `UUID` | FK -> users. Required |
| `provider_type` | `ProviderType` | Required |
| `provider_id` | `UUID \| null` | For individual providers |
| `organization_id` | `UUID \| null` | For organization providers |
| `service_id` | `UUID` | FK -> services. Required |
| `package_id` | `UUID \| null` | FK -> service_packages. For package-based recurrences |
| `frequency` | `RecurrenceFrequency` | Enum: `weekly`, `biweekly`, `monthly`. Required |
| `day_of_week` | `number \| null` | 0-6 (Sunday-Saturday). Required for weekly/biweekly |
| `day_of_month` | `number \| null` | 1-31. Required for monthly |
| `preferred_start_time` | `string` | HH:mm format. Required |
| `service_location` | `ServiceLocation` | Required |
| `location_address` | `string \| null` | For at_customer/at_provider |
| `location_lat` | `number \| null` | Latitude |
| `location_lng` | `number \| null` | Longitude |
| `total_occurrences` | `number \| null` | Null = indefinite |
| `occurrences_created` | `number` | Default 0 |
| `start_date` | `Date` | Required |
| `end_date` | `Date \| null` | Null = no end date |
| `status` | `RecurrenceStatus` | Enum: `active`, `paused`, `cancelled`, `completed`. Default `active` |
| `auto_pay` | `boolean` | Default false |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### Invariants

1. Weekly/biweekly requires `day_of_week` (0-6). Monthly requires `day_of_month` (1-31).
2. Generates next N bookings ahead (default 4 look-ahead).
3. Each generated booking has an independent lifecycle.
4. Recurring discount from Pricing BC applied automatically to each occurrence.
5. If `total_occurrences` is set, status transitions to `completed` when `occurrences_created` reaches the total.

#### Key Methods

```typescript
class BookingRecurrence extends Entity<BookingRecurrenceProps> {
  generateNextOccurrences(count: number = 4): Date[] {
    if (this.props.status !== 'active') {
      throw new DomainError('Can only generate occurrences for active recurrences');
    }
    const dates: Date[] = [];
    let current = this.getNextOccurrenceDate();
    for (let i = 0; i < count; i++) {
      if (this.props.endDate && current > this.props.endDate) break;
      if (this.props.totalOccurrences && this.props.occurrencesCreated + i >= this.props.totalOccurrences) break;
      dates.push(current);
      current = this.advanceDate(current);
    }
    this.props.occurrencesCreated += dates.length;
    this.markUpdated();
    return dates;
  }

  pause(): void {
    if (this.props.status !== 'active') throw new DomainError('Can only pause active recurrences');
    this.props.status = 'paused';
    this.markUpdated();
  }

  resume(): void {
    if (this.props.status !== 'paused') throw new DomainError('Can only resume paused recurrences');
    this.props.status = 'active';
    this.markUpdated();
  }

  cancel(): void {
    if (this.props.status === 'cancelled' || this.props.status === 'completed') {
      throw new DomainError(`Cannot cancel recurrence in '${this.props.status}' status`);
    }
    this.props.status = 'cancelled';
    this.markUpdated();
    this.addDomainEvent(new RecurrenceCancelled(this.id, this.props.customerId));
  }
}
```

---

### 3.3 TaskPost Aggregate

**Aggregate Root:** `TaskPost`
**Children:** `Bid[]`

#### TaskPost Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `customer_id` | `UUID` | FK -> users. Required |
| `category_id` | `UUID` | FK -> service_categories. Required |
| `title` | `string` | Required, max 200 chars |
| `description` | `string` | Required, max 5000 chars |
| `location_address` | `string \| null` | Service location |
| `location_lat` | `number \| null` | Latitude |
| `location_lng` | `number \| null` | Longitude |
| `preferred_date` | `Date \| null` | Optional |
| `preferred_time` | `string \| null` | HH:mm. Optional |
| `budget_min` | `number` | Required, > 0 |
| `budget_max` | `number` | Required, >= budget_min |
| `currency` | `string` | ISO 4217. Required |
| `images` | `string[]` | Max 10 items |
| `status` | `TaskPostStatus` | Enum: `open`, `in_progress`, `completed`, `cancelled`, `expired`. Default `open` |
| `expires_at` | `Date` | Auto-set to created_at + 7 days |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### Bid Attributes (Child Entity)

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `task_id` | `UUID` | FK -> task_posts. Required |
| `provider_id` | `UUID` | FK -> users. Required |
| `proposed_price` | `number` | Required, > 0 |
| `currency` | `string` | Must match task currency |
| `message` | `string` | Required, max 2000 chars |
| `proposed_date` | `Date \| null` | Alternative date suggestion |
| `proposed_time` | `string \| null` | Alternative time suggestion |
| `status` | `BidStatus` | Enum: `pending`, `accepted`, `rejected`, `withdrawn`. Default `pending` |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### Invariants

1. Only one bid can be accepted per task. Accepting a bid rejects all others.
2. Accepted bid creates a Path D booking and transitions task to `in_progress`.
3. Tasks expire after 7 days if no bid is accepted.
4. A provider can only submit one bid per task.
5. A customer cannot bid on their own task.
6. `budget_max >= budget_min > 0`.

---

### 3.4 SubscriptionPlan Aggregate

**Aggregate Root:** `SubscriptionPlan`

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `service_id` | `UUID` | FK -> services. Required |
| `provider_type` | `ProviderType` | Required |
| `provider_id` | `UUID \| null` | For individual providers |
| `organization_id` | `UUID \| null` | For organization providers |
| `name` | `string` | Required, max 200 chars |
| `description` | `string` | Required, max 2000 chars |
| `price` | `number` | Stored in smallest currency unit. Required, > 0 |
| `currency` | `string` | ISO 4217. Required |
| `billing_frequency` | `BillingFrequency` | Enum: `monthly`, `quarterly`, `annual`. Required |
| `includes` | `JSON` | Array of included items/features |
| `max_subscribers` | `number \| null` | Null = unlimited |
| `is_active` | `boolean` | Default true |
| `sort_order` | `number` | Default 0 |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

---

### 3.5 ServiceSubscription Aggregate

**Aggregate Root:** `ServiceSubscription`
**Children:** `SubscriptionBilling[]`

#### ServiceSubscription Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `customer_id` | `UUID` | FK -> users. Required |
| `subscription_plan_id` | `UUID` | FK -> subscription_plans. Required |
| `provider_type` | `ProviderType` | Required |
| `provider_id` | `UUID \| null` | For individual providers |
| `organization_id` | `UUID \| null` | For organization providers |
| `service_id` | `UUID` | FK -> services. Required |
| `billing_frequency` | `BillingFrequency` | Locked from plan at subscription time |
| `price_per_cycle` | `number` | Locked from plan at subscription time (grandfathered) |
| `currency` | `string` | ISO 4217. Required |
| `current_period_start` | `Date` | Required |
| `current_period_end` | `Date` | Required |
| `next_billing_date` | `Date` | Required |
| `status` | `SubscriptionStatus` | Enum: `pending`, `active`, `paused`, `cancelled`, `expired`. Default `pending` |
| `started_at` | `Date \| null` | Set on first payment |
| `paused_at` | `Date \| null` | Set when paused |
| `resumed_at` | `Date \| null` | Set when resumed |
| `cancelled_at` | `Date \| null` | Set when cancelled |
| `cancellation_reason` | `string \| null` | Reason for cancellation |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### SubscriptionBilling Attributes (Child Entity)

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `subscription_id` | `UUID` | FK -> service_subscriptions. Required |
| `payment_intent_id` | `UUID \| null` | FK -> payment_intents. Set when payment initiated |
| `billing_period_start` | `Date` | Required |
| `billing_period_end` | `Date` | Required |
| `amount` | `number` | In smallest currency unit. Required |
| `currency` | `string` | ISO 4217. Required |
| `platform_fee` | `number` | Required |
| `provider_earnings` | `number` | Required |
| `status` | `BillingStatus` | Enum: `pending`, `paid`, `failed`, `refunded`. Default `pending` |
| `retry_count` | `number` | Default 0, max 3 |
| `paid_at` | `Date \| null` | Set on successful payment |
| `failed_at` | `Date \| null` | Set on final failure |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### Subscription Lifecycle

```
pending ──[first payment ok]──► active ──[customer pauses]──► paused ──[resumes]──► active
                                   │                                                   │
                                   ├──[customer cancels]──► cancelled (end of period)   │
                                   └──[payment fails x3]──► expired                    │
                                                                                       │
                                         paused ──[customer cancels]──► cancelled ◄────┘
```

#### Invariants

1. `price_per_cycle` is locked at subscription time (grandfathered pricing).
2. Cancellation is effective at end of current billing period (no mid-cycle cancellation).
3. Maximum 3 payment retries over 7 days before expiration.
4. Pausing stops billing but preserves the subscription record.
5. `platform_fee + provider_earnings = amount` for each billing record.

---

## 4. Value Objects

```typescript
const BookingPath = {
  PACKAGE: 'package',
  HOURLY: 'hourly',
  CUSTOM_QUOTE: 'custom_quote',
  TASK_BID: 'task_bid',
} as const;
type BookingPath = (typeof BookingPath)[keyof typeof BookingPath];

const BookingStatus = {
  PENDING: 'pending',
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
  EXPIRED: 'expired',
} as const;
type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

const ServiceLocation = {
  AT_CUSTOMER: 'at_customer',
  AT_PROVIDER: 'at_provider',
  REMOTE: 'remote',
} as const;
type ServiceLocation = (typeof ServiceLocation)[keyof typeof ServiceLocation];

const RecurrenceFrequency = {
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
} as const;
type RecurrenceFrequency = (typeof RecurrenceFrequency)[keyof typeof RecurrenceFrequency];

const RecurrenceStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
} as const;
type RecurrenceStatus = (typeof RecurrenceStatus)[keyof typeof RecurrenceStatus];

const SubscriptionStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;
type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

const BillingFrequency = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ANNUAL: 'annual',
} as const;
type BillingFrequency = (typeof BillingFrequency)[keyof typeof BillingFrequency];

const BillingStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
type BillingStatus = (typeof BillingStatus)[keyof typeof BillingStatus];

const TaskPostStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;
type TaskPostStatus = (typeof TaskPostStatus)[keyof typeof TaskPostStatus];

const BidStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
} as const;
type BidStatus = (typeof BidStatus)[keyof typeof BidStatus];
```

Additional value objects: `BookingId`, `BookingSnapshot` (immutable record), `Budget` (min + max + currency).

---

## 5. Domain Events

### Booking Lifecycle Events

| Event | Trigger | Key Payload | Handlers |
|-------|---------|-------------|----------|
| `BookingCreated` | Any booking path creates a booking | bookingId, customerId, providerId, bookingPath, totalAmount, scheduledDate | Communication: notify provider of new booking |
| `BookingPendingPayment` | Provider accepts booking | bookingId, customerId, totalAmount, paymentExpiresAt | Payment: create PaymentIntent with 30min expiry |
| `BookingConfirmed` | Payment succeeds | bookingId, customerId, slotId | Scheduling: ReserveSlotCapacity. Communication: notify both parties |
| `BookingStarted` | Provider marks service started | bookingId, customerId, startedAt | Communication: notify customer |
| `BookingCompleted` | Provider marks service completed | bookingId, customerId, completedAt, actualDuration | Communication: notify customer (24h to confirm/dispute). Review: enable review submission. User: increment completed count |
| `BookingCancelled` | Either party cancels, or provider declines/times out | bookingId, customerId, cancelledBy, reason | Scheduling: ReleaseSlotCapacity. Payment: process refund per cancellation policy. Communication: notify both parties |
| `BookingExpired` | Payment timeout (30min) exceeded | bookingId, customerId | Scheduling: ReleaseSlotCapacity. Communication: notify both parties |
| `BookingDisputed` | Customer disputes within 24h of completion | bookingId, customerId, reason | Payment: hold payout. Communication: notify provider and support team |

### Recurrence Events

| Event | Trigger | Key Payload | Handlers |
|-------|---------|-------------|----------|
| `RecurrenceCreated` | Customer creates recurring booking | recurrenceId, customerId, frequency, startDate | Communication: notify provider of recurring series |
| `RecurrenceCancelled` | Customer cancels recurring series | recurrenceId, customerId | Cancel all future pending bookings. Communication: notify provider |
| `RecurrenceOccurrenceSkipped` | Customer skips one occurrence | recurrenceId, bookingId | Scheduling: ReleaseSlotCapacity if reserved |

### Subscription Events

| Event | Trigger | Key Payload | Handlers |
|-------|---------|-------------|----------|
| `SubscriptionCreated` | Customer subscribes to a plan | subscriptionId, customerId, planId, pricePerCycle | Payment: create first billing PaymentIntent |
| `SubscriptionRenewed` | Billing cycle ends, auto-renew | subscriptionId, billingId, amount | Payment: create PaymentIntent for next cycle |
| `SubscriptionPaused` | Customer pauses subscription | subscriptionId, customerId | Communication: notify provider |
| `SubscriptionResumed` | Customer resumes subscription | subscriptionId, customerId | Communication: notify provider. Payment: resume billing |
| `SubscriptionCancelled` | Customer cancels (effective end of period) | subscriptionId, customerId, effectiveDate | Communication: notify provider |
| `SubscriptionExpired` | 3 payment failures over 7 days | subscriptionId, customerId | Communication: notify both parties |
| `SubscriptionBillingFailed` | Payment attempt fails | subscriptionId, billingId, retryCount | Schedule retry. Communication: notify customer |

### Task & Bid Events

| Event | Trigger | Key Payload | Handlers |
|-------|---------|-------------|----------|
| `TaskPosted` | Customer publishes a task | taskId, customerId, categoryId, budgetRange | Communication: notify matching providers |
| `BidSubmitted` | Provider submits a bid | bidId, taskId, providerId, proposedPrice | Communication: notify customer |
| `BidAccepted` | Customer accepts a bid | bidId, taskId, customerId, providerId | Create Path D booking. Reject all other bids. Communication: notify all bidders |

---

## 6. Use Cases

### Booking Creation (4 Paths)

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **BookPackage (Path A)** | Customer | customerId, packageId, slotId, serviceLocation, location?, description? | Booking (pending) | BookingCreated | PackageNotFound, SlotUnavailable, ValidationError |
| **BookHourly (Path B)** | Customer | customerId, serviceId, slotId, hours, serviceLocation, location?, description? | Booking (pending) | BookingCreated | ServiceNotFound, SlotUnavailable, InvalidHours |
| **BookFromQuote (Path C)** | System (on QuoteAccepted) | quoteResponseId, customerId | Booking (pending) | BookingCreated | QuoteResponseNotFound, QuoteNotAccepted |
| **BookFromBid (Path D)** | System (on BidAccepted) | bidId, taskId, customerId | Booking (pending) | BookingCreated | BidNotFound, TaskNotFound |

All paths: load service/package/quote details, call Pricing BC for price calculation (except Path C which uses quote price), build immutable BookingSnapshot, create Booking entity, persist.

### Booking Lifecycle

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **AcceptBooking** | Provider | bookingId, providerId | Booking (pending_payment) | BookingPendingPayment | NotFound, Unauthorized, InvalidState |
| **DeclineBooking** | Provider | bookingId, providerId, reason | Booking (cancelled) | BookingCancelled | NotFound, Unauthorized, InvalidState |
| **ConfirmBooking** | System (on PaymentProcessed) | bookingId | Booking (confirmed) | BookingConfirmed | NotFound, InvalidState |
| **ExpireBooking** | System (scheduled, checks payment_expires_at) | bookingId | Booking (expired) | BookingExpired | NotFound, InvalidState |
| **StartBooking** | Provider | bookingId, providerId | Booking (in_progress) | BookingStarted | NotFound, Unauthorized, InvalidState |
| **CompleteBooking** | Provider | bookingId, providerId, actualDuration? | Booking (completed) | BookingCompleted | NotFound, Unauthorized, InvalidState |
| **ConfirmCompletion** | Customer | bookingId, customerId | Booking (confirmed_at set) | -- | NotFound, Unauthorized, InvalidState |
| **DisputeBooking** | Customer | bookingId, customerId, reason | Booking (disputed) | BookingDisputed | NotFound, Unauthorized, InvalidState, DisputeWindowExpired |
| **CancelBooking** | Customer or Provider | bookingId, userId, reason | Booking (cancelled) | BookingCancelled | NotFound, CannotCancelCompleted |
| **AutoConfirmCompletion** | System (scheduled, 24h after completion) | -- | Updated bookings | -- | -- |
| **ExpireProviderAcceptance** | System (scheduled, 24h after creation) | -- | Cancelled bookings | BookingCancelled | -- |

### Recurrence

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **CreateRecurringBooking** | Customer | customerId, serviceId, packageId?, frequency, dayOfWeek/dayOfMonth, startTime, location, totalOccurrences?, autoPay? | BookingRecurrence + first N Bookings | RecurrenceCreated, BookingCreated (xN) | ServiceNotFound, ValidationError |
| **SkipRecurrenceOccurrence** | Customer | recurrenceId, bookingId | Updated Booking (cancelled) | RecurrenceOccurrenceSkipped | NotFound, Unauthorized |
| **PauseRecurrence** | Customer | recurrenceId, customerId | BookingRecurrence (paused) | -- | NotFound, Unauthorized, InvalidState |
| **ResumeRecurrence** | Customer | recurrenceId, customerId | BookingRecurrence (active) | -- | NotFound, Unauthorized, InvalidState |
| **CancelRecurrence** | Customer | recurrenceId, customerId | BookingRecurrence (cancelled) | RecurrenceCancelled | NotFound, Unauthorized |
| **GenerateNextOccurrences** | System (scheduled) | -- | New Bookings | BookingCreated (xN) | -- |

### Tasks & Bids

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **PostTask** | Customer | customerId, categoryId, title, description, location?, date?, time?, budgetMin, budgetMax, images? | TaskPost (open) | TaskPosted | ValidationError |
| **SubmitBid** | Provider | taskId, providerId, proposedPrice, message, proposedDate?, proposedTime? | Bid (pending) | BidSubmitted | TaskNotFound, AlreadyBid, OwnTaskBid, TaskNotOpen |
| **AcceptBid** | Customer | bidId, customerId | Bid (accepted) + Booking (pending) | BidAccepted, BookingCreated | BidNotFound, Unauthorized, TaskNotOpen |
| **WithdrawBid** | Provider | bidId, providerId | Bid (withdrawn) | -- | BidNotFound, Unauthorized, BidNotPending |
| **ExpireTasks** | System (scheduled) | -- | Expired TaskPosts | -- | -- |

### Subscriptions

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **CreateSubscriptionPlan** | Provider | serviceId, providerId, name, description, price, currency, billingFrequency, includes, maxSubscribers? | SubscriptionPlan | -- | ServiceNotFound, Unauthorized |
| **UpdateSubscriptionPlan** | Provider | planId, providerId, name?, description?, price?, includes?, maxSubscribers?, isActive? | SubscriptionPlan | -- | NotFound, Unauthorized |
| **Subscribe** | Customer | planId, customerId | ServiceSubscription (pending) | SubscriptionCreated | PlanNotFound, PlanInactive, MaxSubscribersReached |
| **PauseSubscription** | Customer | subscriptionId, customerId | ServiceSubscription (paused) | SubscriptionPaused | NotFound, Unauthorized, InvalidState |
| **ResumeSubscription** | Customer | subscriptionId, customerId | ServiceSubscription (active) | SubscriptionResumed | NotFound, Unauthorized, InvalidState |
| **CancelSubscription** | Customer | subscriptionId, customerId, reason? | ServiceSubscription (cancelled) | SubscriptionCancelled | NotFound, Unauthorized, InvalidState |
| **RenewSubscription** | System (scheduled, on billing date) | subscriptionId | SubscriptionBilling (pending) | SubscriptionRenewed | NotFound, InvalidState |
| **RetrySubscriptionPayment** | System (on PaymentFailed) | billingId | SubscriptionBilling (retry scheduled) | SubscriptionBillingFailed | MaxRetriesExceeded |
| **ExpireSubscription** | System (after max retries) | subscriptionId | ServiceSubscription (expired) | SubscriptionExpired | NotFound |

---

## 7. Repository Ports

```typescript
interface BookingRepository {
  findById(id: string): Promise<Booking | null>;
  findByCustomer(customerId: string, pagination: { limit: number; offset: number }): Promise<{ bookings: Booking[]; total: number }>;
  findByProvider(providerId: string, pagination: { limit: number; offset: number }): Promise<{ bookings: Booking[]; total: number }>;
  findByRecurrence(recurrenceId: string): Promise<Booking[]>;
  findPendingExpired(): Promise<Booking[]>;
  findPaymentExpired(): Promise<Booking[]>;
  findCompletedUnconfirmed(cutoffDate: Date): Promise<Booking[]>;
  findCompletedByCustomerAndProvider(customerId: string, providerId: string): Promise<number>;
  save(booking: Booking): Promise<void>;
}

interface BookingRecurrenceRepository {
  findById(id: string): Promise<BookingRecurrence | null>;
  findByCustomer(customerId: string): Promise<BookingRecurrence[]>;
  findActiveNeedingGeneration(lookAheadCount: number): Promise<BookingRecurrence[]>;
  save(recurrence: BookingRecurrence): Promise<void>;
}

interface TaskPostRepository {
  findById(id: string): Promise<TaskPost | null>;
  findByCustomer(customerId: string, pagination: { limit: number; offset: number }): Promise<{ tasks: TaskPost[]; total: number }>;
  findOpen(filters: { categoryId?: string; location?: { lat: number; lng: number; radiusKm: number } }, pagination: { limit: number; offset: number }): Promise<{ tasks: TaskPost[]; total: number }>;
  findExpired(): Promise<TaskPost[]>;
  save(task: TaskPost): Promise<void>;
}

interface BidRepository {
  findById(id: string): Promise<Bid | null>;
  findByTask(taskId: string): Promise<Bid[]>;
  findByProvider(providerId: string): Promise<Bid[]>;
  findByTaskAndProvider(taskId: string, providerId: string): Promise<Bid | null>;
  save(bid: Bid): Promise<void>;
  saveBatch(bids: Bid[]): Promise<void>;
}

interface SubscriptionPlanRepository {
  findById(id: string): Promise<SubscriptionPlan | null>;
  findByService(serviceId: string): Promise<SubscriptionPlan[]>;
  findByProvider(providerId: string): Promise<SubscriptionPlan[]>;
  findActiveByProvider(providerId: string): Promise<SubscriptionPlan[]>;
  save(plan: SubscriptionPlan): Promise<void>;
}

interface ServiceSubscriptionRepository {
  findById(id: string): Promise<ServiceSubscription | null>;
  findByCustomer(customerId: string): Promise<ServiceSubscription[]>;
  findByPlan(planId: string): Promise<ServiceSubscription[]>;
  findActiveByPlan(planId: string): Promise<{ subscriptions: ServiceSubscription[]; total: number }>;
  findDueForRenewal(date: Date): Promise<ServiceSubscription[]>;
  save(subscription: ServiceSubscription): Promise<void>;
}

interface SubscriptionBillingRepository {
  findById(id: string): Promise<SubscriptionBilling | null>;
  findBySubscription(subscriptionId: string): Promise<SubscriptionBilling[]>;
  findFailedNeedingRetry(maxRetries: number): Promise<SubscriptionBilling[]>;
  save(billing: SubscriptionBilling): Promise<void>;
}
```

---

## 8. Entity Schemas

### Drizzle ORM Schema

```typescript
import {
  pgTable, uuid, varchar, text, jsonb, boolean, timestamp,
  decimal, integer, date, time, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Bookings ──────────────────────────────────────────────

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull(),
    providerType: varchar('provider_type', { length: 20 }).notNull(),
    providerId: uuid('provider_id'),
    organizationId: uuid('organization_id'),
    staffMemberId: uuid('staff_member_id'),
    serviceId: uuid('service_id'),
    packageId: uuid('package_id'),
    taskId: uuid('task_id'),
    bidId: uuid('bid_id'),
    quoteResponseId: uuid('quote_response_id'),
    recurrenceId: uuid('recurrence_id'),
    slotId: uuid('slot_id'),
    bookingPath: varchar('booking_path', { length: 20 }).notNull(),
    serviceLocation: varchar('service_location', { length: 20 }).notNull(),
    scheduledDate: date('scheduled_date').notNull(),
    scheduledStartTime: time('scheduled_start_time').notNull(),
    scheduledEndTime: time('scheduled_end_time').notNull(),
    estimatedDurationMinutes: integer('estimated_duration_minutes').notNull(),
    actualDurationMinutes: integer('actual_duration_minutes'),
    locationAddress: text('location_address'),
    locationLat: decimal('location_lat', { precision: 10, scale: 7 }),
    locationLng: decimal('location_lng', { precision: 10, scale: 7 }),
    description: text('description'),
    baseAmount: decimal('base_amount', { precision: 12, scale: 2 }).notNull(),
    discountAmount: decimal('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    platformFee: decimal('platform_fee', { precision: 12, scale: 2 }).notNull(),
    providerEarnings: decimal('provider_earnings', { precision: 12, scale: 2 }).notNull(),
    tipAmount: decimal('tip_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    snapshot: jsonb('snapshot').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    paymentExpiresAt: timestamp('payment_expires_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    customerConfirmedAt: timestamp('customer_confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_bookings_customer').on(table.customerId),
    index('idx_bookings_provider').on(table.providerId),
    index('idx_bookings_organization').on(table.organizationId),
    index('idx_bookings_staff').on(table.staffMemberId),
    index('idx_bookings_service').on(table.serviceId),
    index('idx_bookings_status').on(table.status),
    index('idx_bookings_scheduled_date').on(table.scheduledDate),
    index('idx_bookings_recurrence').on(table.recurrenceId),
    index('idx_bookings_payment_expires').on(table.paymentExpiresAt),
    check('booking_status_check', sql`${table.status} IN ('pending','pending_payment','confirmed','in_progress','completed','cancelled','disputed','expired')`),
    check('booking_path_check', sql`${table.bookingPath} IN ('package','hourly','custom_quote','task_bid')`),
    check('provider_type_check', sql`${table.providerType} IN ('individual','organization')`),
    check('service_location_check', sql`${table.serviceLocation} IN ('at_customer','at_provider','remote')`),
    check('base_amount_positive', sql`${table.baseAmount} > 0`),
    check('discount_non_negative', sql`${table.discountAmount} >= 0`),
    check('total_amount_positive', sql`${table.totalAmount} > 0`),
  ],
);

// ── Booking Recurrences ───────────────────────────────────

export const bookingRecurrences = pgTable(
  'booking_recurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull(),
    providerType: varchar('provider_type', { length: 20 }).notNull(),
    providerId: uuid('provider_id'),
    organizationId: uuid('organization_id'),
    serviceId: uuid('service_id').notNull(),
    packageId: uuid('package_id'),
    frequency: varchar('frequency', { length: 20 }).notNull(),
    dayOfWeek: integer('day_of_week'),
    dayOfMonth: integer('day_of_month'),
    preferredStartTime: time('preferred_start_time').notNull(),
    serviceLocation: varchar('service_location', { length: 20 }).notNull(),
    locationAddress: text('location_address'),
    locationLat: decimal('location_lat', { precision: 10, scale: 7 }),
    locationLng: decimal('location_lng', { precision: 10, scale: 7 }),
    totalOccurrences: integer('total_occurrences'),
    occurrencesCreated: integer('occurrences_created').notNull().default(0),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    autoPay: boolean('auto_pay').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_recurrences_customer').on(table.customerId),
    index('idx_recurrences_provider').on(table.providerId),
    index('idx_recurrences_status').on(table.status),
    check('recurrence_frequency_check', sql`${table.frequency} IN ('weekly','biweekly','monthly')`),
    check('recurrence_status_check', sql`${table.status} IN ('active','paused','cancelled','completed')`),
    check('day_of_week_range', sql`${table.dayOfWeek} IS NULL OR (${table.dayOfWeek} >= 0 AND ${table.dayOfWeek} <= 6)`),
    check('day_of_month_range', sql`${table.dayOfMonth} IS NULL OR (${table.dayOfMonth} >= 1 AND ${table.dayOfMonth} <= 31)`),
  ],
);

// ── Task Posts ────────────────────────────────────────────

export const taskPosts = pgTable(
  'task_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    locationAddress: text('location_address'),
    locationLat: decimal('location_lat', { precision: 10, scale: 7 }),
    locationLng: decimal('location_lng', { precision: 10, scale: 7 }),
    preferredDate: date('preferred_date'),
    preferredTime: time('preferred_time'),
    budgetMin: decimal('budget_min', { precision: 12, scale: 2 }).notNull(),
    budgetMax: decimal('budget_max', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    images: jsonb('images').notNull().default(sql`'[]'::jsonb`),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tasks_customer').on(table.customerId),
    index('idx_tasks_category').on(table.categoryId),
    index('idx_tasks_status').on(table.status),
    index('idx_tasks_expires_at').on(table.expiresAt),
    check('task_status_check', sql`${table.status} IN ('open','in_progress','completed','cancelled','expired')`),
    check('budget_positive', sql`${table.budgetMin} > 0`),
    check('budget_range', sql`${table.budgetMax} >= ${table.budgetMin}`),
  ],
);

// ── Bids ──────────────────────────────────────────────────

export const bids = pgTable(
  'bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => taskPosts.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id').notNull(),
    proposedPrice: decimal('proposed_price', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    message: text('message').notNull(),
    proposedDate: date('proposed_date'),
    proposedTime: time('proposed_time'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_bids_task').on(table.taskId),
    index('idx_bids_provider').on(table.providerId),
    index('idx_bids_status').on(table.status),
    uniqueIndex('uq_bids_task_provider').on(table.taskId, table.providerId),
    check('bid_status_check', sql`${table.status} IN ('pending','accepted','rejected','withdrawn')`),
    check('proposed_price_positive', sql`${table.proposedPrice} > 0`),
  ],
);

// ── Subscription Plans ────────────────────────────────────

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceId: uuid('service_id').notNull(),
    providerType: varchar('provider_type', { length: 20 }).notNull(),
    providerId: uuid('provider_id'),
    organizationId: uuid('organization_id'),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description').notNull(),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    billingFrequency: varchar('billing_frequency', { length: 20 }).notNull(),
    includes: jsonb('includes').notNull().default(sql`'[]'::jsonb`),
    maxSubscribers: integer('max_subscribers'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_sub_plans_service').on(table.serviceId),
    index('idx_sub_plans_provider').on(table.providerId),
    index('idx_sub_plans_active').on(table.isActive),
    check('plan_price_positive', sql`${table.price} > 0`),
    check('billing_freq_check', sql`${table.billingFrequency} IN ('monthly','quarterly','annual')`),
  ],
);

// ── Service Subscriptions ─────────────────────────────────

export const serviceSubscriptions = pgTable(
  'service_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull(),
    subscriptionPlanId: uuid('subscription_plan_id').notNull().references(() => subscriptionPlans.id),
    providerType: varchar('provider_type', { length: 20 }).notNull(),
    providerId: uuid('provider_id'),
    organizationId: uuid('organization_id'),
    serviceId: uuid('service_id').notNull(),
    billingFrequency: varchar('billing_frequency', { length: 20 }).notNull(),
    pricePerCycle: decimal('price_per_cycle', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    nextBillingDate: timestamp('next_billing_date', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_subscriptions_customer').on(table.customerId),
    index('idx_subscriptions_plan').on(table.subscriptionPlanId),
    index('idx_subscriptions_provider').on(table.providerId),
    index('idx_subscriptions_status').on(table.status),
    index('idx_subscriptions_next_billing').on(table.nextBillingDate),
    check('sub_status_check', sql`${table.status} IN ('pending','active','paused','cancelled','expired')`),
    check('sub_price_positive', sql`${table.pricePerCycle} > 0`),
  ],
);

// ── Subscription Billings ─────────────────────────────────

export const subscriptionBillings = pgTable(
  'subscription_billings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id').notNull().references(() => serviceSubscriptions.id, { onDelete: 'cascade' }),
    paymentIntentId: uuid('payment_intent_id'),
    billingPeriodStart: timestamp('billing_period_start', { withTimezone: true }).notNull(),
    billingPeriodEnd: timestamp('billing_period_end', { withTimezone: true }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    platformFee: decimal('platform_fee', { precision: 12, scale: 2 }).notNull(),
    providerEarnings: decimal('provider_earnings', { precision: 12, scale: 2 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_billings_subscription').on(table.subscriptionId),
    index('idx_billings_status').on(table.status),
    index('idx_billings_payment_intent').on(table.paymentIntentId),
    check('billing_status_check', sql`${table.status} IN ('pending','paid','failed','refunded')`),
    check('billing_amount_positive', sql`${table.amount} > 0`),
    check('billing_retry_max', sql`${table.retryCount} <= 3`),
  ],
);
```

---

## 9. Business Rules & Invariants

### Booking Lifecycle Rules

| # | Rule | Enforcement |
|---|------|-------------|
| BK1 | Provider has 24 hours to accept or decline a pending booking. After timeout, booking is auto-cancelled. | Scheduled job: `ExpireProviderAcceptance` |
| BK2 | Customer has 30 minutes (configurable) to complete payment after provider acceptance. After timeout, booking expires. | `payment_expires_at` field + scheduled job: `ExpireBooking` |
| BK3 | Customer has 24 hours after completion to confirm or dispute. After timeout, auto-confirmed and payout released. | Scheduled job: `AutoConfirmCompletion` |
| BK4 | Booking snapshot is immutable after creation. Even if the service price or details change later, the booking retains original terms. | Domain logic: snapshot set once in `Booking.create()`, no setter |
| BK5 | `booking_path` determines which FK is required: `package` -> `package_id`, `hourly` -> `service_id`, `custom_quote` -> `quote_response_id`, `task_bid` -> `task_id` + `bid_id`. | Domain validation in `Booking.create()` |
| BK6 | `total_amount = base_amount - discount_amount`. `platform_fee + provider_earnings = total_amount`. | Domain invariant enforced at creation |
| BK7 | For hourly bookings (Path B), `actual_duration_minutes` can differ from `estimated_duration_minutes` and final billing adjusts accordingly. | Domain logic in `Booking.complete()` |

### Cancellation Policy

| Time Before Start | Customer Refund | Provider Penalty |
|-------------------|----------------|------------------|
| 24+ hours | 100% | None |
| 12-24 hours | 75% | None |
| 2-12 hours | 50% | None |
| < 2 hours | 0% | None |
| Provider cancels (any time) | 100% | Rating impact |

### Recurring Booking Rules

| # | Rule | Enforcement |
|---|------|-------------|
| RB1 | Weekly/biweekly frequency requires `day_of_week`. Monthly requires `day_of_month`. | Domain validation |
| RB2 | System generates next N bookings ahead (default 4 look-ahead). | Scheduled job: `GenerateNextOccurrences` |
| RB3 | Each generated booking has an independent lifecycle (can be individually cancelled, rescheduled). | Separate Booking entities linked by `recurrence_id` |
| RB4 | Recurring discount from Pricing BC applied automatically to each occurrence. | BookPackage/BookHourly passes `isRecurring = true` to CalculatePrice |
| RB5 | Pausing a recurrence stops new occurrence generation but keeps existing pending bookings. | Domain logic in `BookingRecurrence.pause()` |

### Subscription Rules

| # | Rule | Enforcement |
|---|------|-------------|
| SB1 | Price is locked at subscription time (grandfathered). Plan price changes do not affect existing subscribers. | `price_per_cycle` copied from plan at subscription creation |
| SB2 | Cancellation is effective at end of current billing period. Customer retains access until period ends. | Domain logic: sets `cancelled_at` but status remains `active` until period end |
| SB3 | Maximum 3 payment retries over 7 days before subscription expires. | `retry_count` with max check + scheduled retry job |
| SB4 | Active subscriber count must not exceed `max_subscribers` on the plan (if set). | Use case validation in `Subscribe` |

### Task & Bid Rules

| # | Rule | Enforcement |
|---|------|-------------|
| TB1 | Only one bid can be accepted per task. Accepting a bid auto-rejects all others. | Domain logic in `TaskPost.acceptBid()` |
| TB2 | A provider can only submit one bid per task. | DB unique index on (`task_id`, `provider_id`) |
| TB3 | A customer cannot bid on their own task. | Use case validation |
| TB4 | Tasks expire after 7 days if no bid is accepted. | `expires_at` field + scheduled job |
| TB5 | `budget_max >= budget_min > 0`. | Domain validation + DB CHECK |

---

## 10. Cross-Context Dependencies

### Upstream Dependencies (Depends On)

| Source BC | What Booking Needs | How It Gets It |
|-----------|-------------------|----------------|
| **User** | Customer identity, provider identity, organization identity, staff member details for assignment and authorization | Queries User BC read models. Subscribes to `UserSuspended` (cancel all future bookings), `StaffMemberRemoved` (reassign or cancel staff bookings) |
| **Catalog** | Service details (name, duration, buffer, pricing_mode, provider_type), package details (name, price, includes) for snapshot creation | Queries Catalog BC read models. Subscribes to `ServiceArchived` (cancel pending bookings for archived service) |
| **Scheduling** | Available slots for booking creation. Slot reservation and release for booking lifecycle | Queries `GetAvailableSlots`. Calls `ReserveSlotCapacity` on confirmation. Calls `ReleaseSlotCapacity` on cancellation/expiry. Subscribes to `SlotsRegenerated` (validate existing bookings) |
| **Pricing** | Price calculation (base amount, discount, total) for Paths A, B, D. Accepted quote details for Path C | Calls `CalculatePrice` use case for Paths A, B, D. Subscribes to `QuoteAccepted` (create Path C booking) |

### Partnership

| Partner BC | Relationship | Events Exchanged |
|-----------|-------------|------------------|
| **Payment** | Mutual dependency. Booking creates payment intents; Payment confirms or fails them. | Booking publishes: `BookingPendingPayment`, `BookingCompleted`, `BookingCancelled`, `SubscriptionRenewed`. Payment publishes: `PaymentProcessed`, `PaymentFailed`, `PaymentExpired`, `PaymentRefunded` |

### Downstream Dependents (Depended On By)

| Consuming BC | What It Needs | How It Gets It |
|-------------|---------------|----------------|
| **Communication** | All booking, recurrence, subscription, and task lifecycle events for notifications and messaging | Consumes all Booking BC events to trigger push notifications, emails, SMS, and in-app notifications |
| **Review** | Booking completion confirmation to enable review submission | Consumes `BookingCompleted` to enable review window for the customer |
| **User** | Booking completion to update provider/organization stats | Consumes `BookingCompleted` to increment `total_completed_tasks` / `total_completed_bookings` |

### Events Published (Summary)

| Event | Consumers |
|-------|-----------|
| `BookingCreated` | Communication |
| `BookingPendingPayment` | Payment |
| `BookingConfirmed` | Scheduling, Communication |
| `BookingStarted` | Communication |
| `BookingCompleted` | Communication, Review, User, Payment |
| `BookingCancelled` | Scheduling, Payment, Communication |
| `BookingExpired` | Scheduling, Communication |
| `BookingDisputed` | Payment, Communication |
| `RecurrenceCreated` | Communication |
| `RecurrenceCancelled` | Communication |
| `TaskPosted` | Communication |
| `BidSubmitted` | Communication |
| `BidAccepted` | Communication |
| `SubscriptionCreated` | Payment, Communication |
| `SubscriptionRenewed` | Payment |
| `SubscriptionPaused` | Communication |
| `SubscriptionResumed` | Communication, Payment |
| `SubscriptionCancelled` | Communication |
| `SubscriptionExpired` | Communication |
| `SubscriptionBillingFailed` | Communication |

### Events Subscribed

| Event | Source BC | Handler |
|-------|----------|---------|
| `UserSuspended` | User | Cancel all future pending/confirmed bookings for the suspended user (as customer or provider). Cancel active subscriptions. |
| `StaffMemberRemoved` | User | Reassign or cancel future bookings assigned to the removed staff member. |
| `ServiceArchived` | Catalog | Cancel all pending bookings for the archived service. Cancel active recurrences for the service. |
| `SlotsRegenerated` | Scheduling | Verify existing confirmed bookings in the affected date range still have valid slots. Flag or cancel orphaned bookings. |
| `QuoteAccepted` | Pricing | Create a Path C booking using the accepted quote's price breakdown and details. |
| `PaymentProcessed` | Payment | Transition booking from `pending_payment` to `confirmed` via `ConfirmBooking`. |
| `PaymentFailed` | Payment | If retries exhausted, transition booking to `cancelled`. For subscriptions, increment retry count or expire. |
| `PaymentExpired` | Payment | Transition booking to `expired` via `ExpireBooking`. |
| `PaymentRefunded` | Payment | Record refund details on the cancelled booking. |

### Integration Pattern

The Booking BC uses the **Conformist** pattern upstream: it conforms to User BC's identity model, Catalog BC's service model, Scheduling BC's slot model, and Pricing BC's calculation model. It maintains lightweight local read models of essential data (service names, package details, provider names) synced via domain events for snapshot creation without synchronous cross-BC queries during booking creation.

With Payment BC, the relationship is **Partnership**: both BCs evolve together with synchronized event contracts. Booking creates payment intents; Payment processes them and reports results back. Neither BC writes directly to the other's data store.

Downstream, Booking uses the **Published Language** pattern, emitting well-defined domain events that Communication BC and Review BC consume. These downstream BCs never call Booking use cases directly; they react to events only.
