# Payment Bounded Context

## 1. Overview

The Payment Bounded Context manages all financial operations on the Ntizo service marketplace platform. It processes customer payments, holds funds in escrow until service completion, deducts platform commissions, and distributes provider earnings via multiple payout channels.

**Owns:**
- Payment intent creation and lifecycle management
- Payment transaction processing (authorize, capture, refund)
- Escrow holding and release logic
- Platform commission calculation and deduction
- Provider payout processing (M-Pesa, e-Mola, bank transfer)
- Tip handling (100% to provider)
- Refund processing per cancellation policy
- Payment method management (M-Pesa, e-Mola, Visa/Mastercard via Stripe)

**Delegates:**
- Booking lifecycle decisions to **Booking BC** (partnership)
- User identity and provider details to **User BC**
- Notification delivery to **Communication BC**

**Key Design Principles:**
- Payment Intent pattern: each booking/subscription billing creates one intent; individual attempts are tracked as transactions
- Escrow by default: funds are held until customer confirms completion or 24-hour auto-confirm
- Platform commission deducted before provider payout
- Tips bypass commission and go 100% to the provider
- Configurable payment timeout (default 30 minutes)
- Failed payments can be retried within the timeout window
- ACL pattern isolates external payment processors (M-Pesa, e-Mola, Stripe) from domain logic

---

## 2. Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Payment Intent** | A request to collect a specific amount from a customer for a booking or subscription billing cycle. The root aggregate that tracks the overall payment lifecycle. |
| **Payment Transaction** | A single attempt within a payment intent: an authorization, capture, or refund operation against an external payment processor. Multiple transactions may exist per intent (retries, partial refunds). |
| **Payment Method** | The channel used for payment: `mpesa`, `emola`, `card`. Stored per transaction. |
| **Payment Status** | The lifecycle state of a payment intent: `pending`, `processing`, `completed`, `failed`, `cancelled`, `expired`. |
| **Transaction Type** | The operation type: `authorization`, `capture`, `refund`. |
| **Transaction Status** | The outcome of a single transaction attempt: `pending`, `success`, `failed`. |
| **Escrow** | The holding state of funds after successful payment and before provider payout. Funds are released on customer confirmation or 24-hour auto-confirm. |
| **Platform Commission** | The percentage-based fee the platform deducts from each payment before crediting the provider. |
| **Provider Earnings** | The amount credited to the provider after platform commission deduction: `total_amount - platform_fee`. |
| **Tip** | An optional gratuity added by the customer after service completion. 100% goes to the provider with no commission deduction. |
| **Payout** | A transfer of accumulated provider earnings to an external account (M-Pesa, e-Mola, bank). |
| **Payout Status** | The lifecycle state of a payout: `pending`, `processing`, `completed`, `failed`. |
| **Payment Timeout** | The configurable window (default 30 minutes) within which the customer must complete payment after a payment intent is created. |
| **Refund** | A full or partial return of funds to the customer, processed according to cancellation policy timing rules. |
| **Gateway Reference** | The external payment processor's unique transaction identifier, stored for reconciliation. |

---

## 3. Aggregates & Entities

### 3.1 PaymentIntent Aggregate

**Aggregate Root:** `PaymentIntent`
**Children:** `PaymentTransaction[]`

#### PaymentIntent Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `booking_id` | `UUID \| null` | FK -> bookings. Set for booking payments |
| `subscription_billing_id` | `UUID \| null` | FK -> subscription_billings. Set for subscription payments |
| `customer_id` | `UUID` | FK -> users. Required |
| `provider_id` | `UUID` | FK -> users (or organization). Required |
| `amount` | `number` | Smallest currency unit (cents). Required, > 0 |
| `currency` | `string` | ISO 4217, 3 chars. Required |
| `platform_fee` | `number` | Commission amount. Required, >= 0 |
| `provider_earnings` | `number` | amount - platform_fee. Required |
| `tip_amount` | `number` | Default 0. Not subject to commission |
| `payment_method` | `PaymentMethod \| null` | Set when customer selects method |
| `status` | `PaymentIntentStatus` | Default `pending` |
| `escrow_held` | `boolean` | Default false. True after successful capture |
| `escrow_released_at` | `Date \| null` | Set when escrow is released to provider |
| `refund_amount` | `number` | Default 0. Tracks total refunded |
| `refund_reason` | `string \| null` | Reason for refund |
| `expires_at` | `Date` | Required. Default: created_at + 30 minutes |
| `completed_at` | `Date \| null` | Set on successful completion |
| `failed_at` | `Date \| null` | Set on final failure |
| `cancelled_at` | `Date \| null` | Set on cancellation |
| `metadata` | `JSON \| null` | Arbitrary key-value data for reconciliation |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### PaymentTransaction Attributes (Child Entity)

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `payment_intent_id` | `UUID` | FK -> payment_intents. Required |
| `type` | `TransactionType` | Enum: `authorization`, `capture`, `refund`. Required |
| `payment_method` | `PaymentMethod` | Enum: `mpesa`, `emola`, `card`. Required |
| `amount` | `number` | Smallest currency unit. Required, > 0 |
| `currency` | `string` | ISO 4217. Required |
| `status` | `TransactionStatus` | Enum: `pending`, `success`, `failed`. Default `pending` |
| `gateway_reference` | `string \| null` | External processor transaction ID |
| `gateway_response` | `JSON \| null` | Raw response from processor (for debugging) |
| `failure_reason` | `string \| null` | Human-readable failure description |
| `failure_code` | `string \| null` | Processor-specific error code |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### Status State Machine

```
                     ┌───────────┐
                     │  PENDING  │
                     └─────┬─────┘
              initiate()   │    cancel() / expire()
              ┌────────────┼────────────┐
              v                         v
      ┌────────────┐           ┌────────────┐
      │ PROCESSING │           │ CANCELLED  │
      └──────┬─────┘           └────────────┘
  success()  │  fail()                  ┌────────────┐
      ┌──────┼──────┐                   │  EXPIRED   │
      v             v                   └────────────┘
┌───────────┐ ┌──────────┐
│ COMPLETED │ │  FAILED  │
└─────┬─────┘ └──────────┘
      │ refund()
      v
┌───────────┐
│ COMPLETED │ (with refund_amount > 0)
└───────────┘
```

#### Invariants

1. Exactly one of `booking_id` or `subscription_billing_id` must be set (not both, not neither).
2. `platform_fee + provider_earnings = amount`.
3. `tip_amount` is excluded from commission calculation.
4. `refund_amount` cannot exceed `amount`.
5. Cannot transition to `processing` after `expires_at` has passed.
6. Cannot refund a payment that is not in `completed` status.
7. Only one transaction of type `capture` can succeed per intent.
8. Escrow must be held (`escrow_held = true`) before it can be released.
9. Multiple `authorization` transactions are allowed (retries), but only one can have `status = success`.

#### Domain Logic (Key Methods)

```typescript
import { Entity, DomainError } from 'onion-lasagna';

type PaymentIntentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
type PaymentMethod = 'mpesa' | 'emola' | 'card';
type TransactionType = 'authorization' | 'capture' | 'refund';
type TransactionStatus = 'pending' | 'success' | 'failed';

const PAYMENT_TIMEOUT_MINUTES = 30;

interface PaymentIntentProps {
  bookingId: string | null;
  subscriptionBillingId: string | null;
  customerId: string;
  providerId: string;
  amount: number;
  currency: string;
  platformFee: number;
  providerEarnings: number;
  tipAmount: number;
  paymentMethod: PaymentMethod | null;
  status: PaymentIntentStatus;
  escrowHeld: boolean;
  escrowReleasedAt: Date | null;
  refundAmount: number;
  refundReason: string | null;
  expiresAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  metadata: Record<string, unknown> | null;
  transactions: PaymentTransaction[];
}

class PaymentIntent extends Entity<PaymentIntentProps> {
  static create(props: Omit<PaymentIntentProps, 'status' | 'escrowHeld' | 'escrowReleasedAt' | 'refundAmount' | 'refundReason' | 'completedAt' | 'failedAt' | 'cancelledAt' | 'transactions'>): PaymentIntent {
    if (!props.bookingId && !props.subscriptionBillingId) {
      throw new DomainError('Payment intent must reference a booking or subscription billing');
    }
    if (props.bookingId && props.subscriptionBillingId) {
      throw new DomainError('Payment intent cannot reference both booking and subscription billing');
    }
    if (props.platformFee + props.providerEarnings !== props.amount) {
      throw new DomainError('platform_fee + provider_earnings must equal amount');
    }
    return new PaymentIntent({
      ...props,
      status: 'pending',
      escrowHeld: false,
      escrowReleasedAt: null,
      refundAmount: 0,
      refundReason: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      transactions: [],
    });
  }

  initiate(method: PaymentMethod): PaymentTransaction {
    this.assertStatus('pending');
    if (new Date() > this.props.expiresAt) {
      throw new DomainError('Payment intent has expired');
    }
    this.props.paymentMethod = method;
    this.props.status = 'processing';
    const txn = PaymentTransaction.create({
      paymentIntentId: this.id,
      type: 'authorization',
      paymentMethod: method,
      amount: this.props.amount,
      currency: this.props.currency,
    });
    this.props.transactions.push(txn);
    this.markUpdated();
    return txn;
  }

  retry(method: PaymentMethod): PaymentTransaction {
    if (this.props.status !== 'processing' && this.props.status !== 'failed') {
      throw new DomainError(`Cannot retry payment in '${this.props.status}' status`);
    }
    if (new Date() > this.props.expiresAt) {
      throw new DomainError('Payment intent has expired');
    }
    this.props.paymentMethod = method;
    this.props.status = 'processing';
    const txn = PaymentTransaction.create({
      paymentIntentId: this.id,
      type: 'authorization',
      paymentMethod: method,
      amount: this.props.amount,
      currency: this.props.currency,
    });
    this.props.transactions.push(txn);
    this.markUpdated();
    return txn;
  }

  completeTransaction(transactionId: string, gatewayReference: string): void {
    const txn = this.findTransaction(transactionId);
    txn.succeed(gatewayReference);
    this.props.status = 'completed';
    this.props.escrowHeld = true;
    this.props.completedAt = new Date();
    this.markUpdated();
    this.addDomainEvent(new PaymentProcessed(
      this.id, this.props.bookingId, this.props.subscriptionBillingId,
      this.props.amount, this.props.currency,
    ));
  }

  failTransaction(transactionId: string, reason: string, code?: string): void {
    const txn = this.findTransaction(transactionId);
    txn.fail(reason, code ?? null);
    if (new Date() > this.props.expiresAt) {
      this.props.status = 'expired';
      this.addDomainEvent(new PaymentExpired(this.id, this.props.bookingId));
    } else {
      this.props.status = 'failed';
      this.props.failedAt = new Date();
      this.addDomainEvent(new PaymentFailed(
        this.id, this.props.bookingId, this.props.subscriptionBillingId, reason,
      ));
    }
    this.markUpdated();
  }

  releaseEscrow(): void {
    if (!this.props.escrowHeld) {
      throw new DomainError('No escrow to release');
    }
    if (this.props.escrowReleasedAt) {
      throw new DomainError('Escrow already released');
    }
    this.props.escrowReleasedAt = new Date();
    this.markUpdated();
    this.addDomainEvent(new EscrowReleased(
      this.id, this.props.providerId, this.props.providerEarnings + this.props.tipAmount, this.props.currency,
    ));
  }

  holdEscrow(): void {
    if (!this.props.escrowHeld) {
      throw new DomainError('Payment not yet completed; no escrow to hold');
    }
    if (this.props.escrowReleasedAt) {
      throw new DomainError('Escrow already released');
    }
    // Escrow remains held -- this is a no-op confirmation used by dispute handlers
  }

  refund(amount: number, reason: string): PaymentTransaction {
    this.assertStatus('completed');
    if (amount + this.props.refundAmount > this.props.amount) {
      throw new DomainError('Refund amount exceeds original payment');
    }
    this.props.refundAmount += amount;
    this.props.refundReason = reason;
    const txn = PaymentTransaction.create({
      paymentIntentId: this.id,
      type: 'refund',
      paymentMethod: this.props.paymentMethod!,
      amount,
      currency: this.props.currency,
    });
    this.props.transactions.push(txn);
    this.markUpdated();
    this.addDomainEvent(new PaymentRefunded(
      this.id, this.props.bookingId, amount, this.props.currency, reason,
    ));
    return txn;
  }

  addTip(amount: number): void {
    if (amount <= 0) throw new DomainError('Tip must be positive');
    this.assertStatus('completed');
    this.props.tipAmount += amount;
    this.markUpdated();
    this.addDomainEvent(new TipAdded(this.id, this.props.providerId, amount, this.props.currency));
  }

  cancel(): void {
    if (this.props.status === 'completed' || this.props.status === 'cancelled' || this.props.status === 'expired') {
      throw new DomainError(`Cannot cancel payment in '${this.props.status}' status`);
    }
    this.props.status = 'cancelled';
    this.props.cancelledAt = new Date();
    this.markUpdated();
  }

  expire(): void {
    if (this.props.status === 'completed' || this.props.status === 'cancelled' || this.props.status === 'expired') {
      throw new DomainError(`Cannot expire payment in '${this.props.status}' status`);
    }
    this.props.status = 'expired';
    this.markUpdated();
    this.addDomainEvent(new PaymentExpired(this.id, this.props.bookingId));
  }

  private assertStatus(expected: PaymentIntentStatus): void {
    if (this.props.status !== expected) {
      throw new DomainError(`Expected status '${expected}', got '${this.props.status}'`);
    }
  }

  private findTransaction(id: string): PaymentTransaction {
    const txn = this.props.transactions.find(t => t.id === id);
    if (!txn) throw new DomainError('Transaction not found');
    return txn;
  }
}
```

#### PaymentTransaction Entity

```typescript
interface PaymentTransactionProps {
  paymentIntentId: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  status: TransactionStatus;
  gatewayReference: string | null;
  gatewayResponse: Record<string, unknown> | null;
  failureReason: string | null;
  failureCode: string | null;
}

class PaymentTransaction extends Entity<PaymentTransactionProps> {
  static create(props: Pick<PaymentTransactionProps, 'paymentIntentId' | 'type' | 'paymentMethod' | 'amount' | 'currency'>): PaymentTransaction {
    return new PaymentTransaction({
      ...props,
      status: 'pending',
      gatewayReference: null,
      gatewayResponse: null,
      failureReason: null,
      failureCode: null,
    });
  }

  succeed(gatewayReference: string, gatewayResponse?: Record<string, unknown>): void {
    this.props.status = 'success';
    this.props.gatewayReference = gatewayReference;
    this.props.gatewayResponse = gatewayResponse ?? null;
  }

  fail(reason: string, code: string | null, gatewayResponse?: Record<string, unknown>): void {
    this.props.status = 'failed';
    this.props.failureReason = reason;
    this.props.failureCode = code;
    this.props.gatewayResponse = gatewayResponse ?? null;
  }
}
```

---

### 3.2 Payout Aggregate

**Aggregate Root:** `Payout`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `provider_id` | `UUID` | FK -> users. Required |
| `amount` | `number` | Smallest currency unit. Required, > 0 |
| `currency` | `string` | ISO 4217. Required |
| `payout_method` | `PayoutMethod` | Enum: `mpesa`, `emola`, `bank_transfer`. Required |
| `destination_account` | `string` | Phone number or bank account. Required |
| `status` | `PayoutStatus` | Enum: `pending`, `processing`, `completed`, `failed`. Default `pending` |
| `gateway_reference` | `string \| null` | External payout processor transaction ID |
| `failure_reason` | `string \| null` | Reason for failure |
| `processed_at` | `Date \| null` | Set when processing starts |
| `completed_at` | `Date \| null` | Set on success |
| `failed_at` | `Date \| null` | Set on failure |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### Invariants

1. `amount` must be > 0.
2. Cannot process a payout if provider has insufficient released earnings.
3. `destination_account` format validated per `payout_method`: phone for M-Pesa/e-Mola, IBAN/account for bank.
4. A failed payout can be retried (creates a new Payout entity).
5. Only `pending` payouts can transition to `processing`.

#### Domain Logic

```typescript
type PayoutMethod = 'mpesa' | 'emola' | 'bank_transfer';
type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface PayoutProps {
  providerId: string;
  amount: number;
  currency: string;
  payoutMethod: PayoutMethod;
  destinationAccount: string;
  status: PayoutStatus;
  gatewayReference: string | null;
  failureReason: string | null;
  processedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}

class Payout extends Entity<PayoutProps> {
  process(): void {
    if (this.props.status !== 'pending') {
      throw new DomainError(`Cannot process payout in '${this.props.status}' status`);
    }
    this.props.status = 'processing';
    this.props.processedAt = new Date();
    this.markUpdated();
  }

  complete(gatewayReference: string): void {
    if (this.props.status !== 'processing') {
      throw new DomainError(`Cannot complete payout in '${this.props.status}' status`);
    }
    this.props.status = 'completed';
    this.props.gatewayReference = gatewayReference;
    this.props.completedAt = new Date();
    this.markUpdated();
    this.addDomainEvent(new PayoutCompleted(this.id, this.props.providerId, this.props.amount, this.props.currency));
  }

  fail(reason: string): void {
    if (this.props.status !== 'processing') {
      throw new DomainError(`Cannot fail payout in '${this.props.status}' status`);
    }
    this.props.status = 'failed';
    this.props.failureReason = reason;
    this.props.failedAt = new Date();
    this.markUpdated();
    this.addDomainEvent(new PayoutFailed(this.id, this.props.providerId, reason));
  }
}
```

---

## 4. Value Objects

```typescript
const PaymentIntentStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;
type PaymentIntentStatus = (typeof PaymentIntentStatus)[keyof typeof PaymentIntentStatus];

const PaymentMethod = {
  MPESA: 'mpesa',
  EMOLA: 'emola',
  CARD: 'card',
} as const;
type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

const TransactionType = {
  AUTHORIZATION: 'authorization',
  CAPTURE: 'capture',
  REFUND: 'refund',
} as const;
type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

const TransactionStatus = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
} as const;
type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

const PayoutMethod = {
  MPESA: 'mpesa',
  EMOLA: 'emola',
  BANK_TRANSFER: 'bank_transfer',
} as const;
type PayoutMethod = (typeof PayoutMethod)[keyof typeof PayoutMethod];

const PayoutStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];
```

Additional value objects: `PaymentIntentId`, `Money` (amount + currency, immutable), `GatewayReference` (string wrapper with format validation per gateway).

---

## 5. Domain Events

| Event | Trigger | Key Payload | Handlers |
|-------|---------|-------------|----------|
| `PaymentProcessed` | Transaction succeeds, intent moves to completed | paymentIntentId, bookingId, subscriptionBillingId, amount, currency | Booking: ConfirmBooking or mark billing as paid. Communication: notify customer + provider |
| `PaymentFailed` | Transaction fails (retries still possible within timeout) | paymentIntentId, bookingId, subscriptionBillingId, reason | Booking: increment retry count for subscriptions. Communication: notify customer |
| `PaymentExpired` | Payment timeout (30min) reached without successful payment | paymentIntentId, bookingId | Booking: ExpireBooking. Communication: notify both parties |
| `PaymentRefunded` | Refund transaction created (full or partial) | paymentIntentId, bookingId, refundAmount, currency, reason | Booking: record refund. Communication: notify customer |
| `EscrowReleased` | Customer confirms or auto-confirm triggers payout eligibility | paymentIntentId, providerId, amount, currency | Credit provider's available balance for payout |
| `TipAdded` | Customer adds tip after completion | paymentIntentId, providerId, tipAmount, currency | Credit provider balance (no commission). Communication: notify provider |
| `PayoutCompleted` | Payout successfully sent to provider's external account | payoutId, providerId, amount, currency | Communication: notify provider |
| `PayoutFailed` | Payout transfer fails at the external processor | payoutId, providerId, reason | Communication: notify provider. Admin: flag for review |

---

## 6. Use Cases

### Payment Lifecycle

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **CreatePaymentIntent** | System (on BookingPendingPayment / SubscriptionRenewed) | bookingId or subscriptionBillingId, customerId, providerId, amount, currency, platformFee, providerEarnings, timeoutMinutes? | PaymentIntent (pending) | -- | ValidationError, InvalidAmountError |
| **InitiatePayment** | Customer | paymentIntentId, paymentMethod | PaymentIntent (processing) + PaymentTransaction (pending) | -- | NotFound, ExpiredError, InvalidStateError |
| **ProcessGatewayCallback** | System (webhook from M-Pesa/e-Mola/Stripe) | transactionId, gatewayReference, success, failureReason? | Updated PaymentIntent | PaymentProcessed or PaymentFailed | NotFound, InvalidStateError |
| **RetryPayment** | Customer | paymentIntentId, paymentMethod | PaymentIntent (processing) + new PaymentTransaction | -- | NotFound, ExpiredError, AlreadyCompletedError |
| **ExpirePaymentIntents** | System (scheduled job) | -- | Expired PaymentIntents | PaymentExpired (per intent) | -- |
| **CancelPaymentIntent** | System (on BookingCancelled before payment) | paymentIntentId | PaymentIntent (cancelled) | -- | NotFound, AlreadyCompletedError |

### Escrow & Tipping

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **ReleaseEscrow** | System (on customer confirmation or 24h auto-confirm) | paymentIntentId | PaymentIntent (escrow released) | EscrowReleased | NotFound, NoEscrowError, AlreadyReleasedError |
| **HoldEscrowOnDispute** | System (on BookingDisputed) | paymentIntentId | PaymentIntent (escrow remains held) | -- | NotFound, NoEscrowError |
| **AddTip** | Customer | paymentIntentId, tipAmount | Updated PaymentIntent | TipAdded | NotFound, InvalidAmountError, PaymentNotCompletedError |

### Refunds

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **ProcessRefund** | System (on BookingCancelled per cancellation policy) | paymentIntentId, refundAmount, reason | PaymentIntent + refund PaymentTransaction | PaymentRefunded | NotFound, ExceedsPaymentError, PaymentNotCompletedError |
| **ProcessGatewayRefundCallback** | System (webhook) | transactionId, gatewayReference, success, failureReason? | Updated PaymentTransaction | -- | NotFound |

### Payouts

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **RequestPayout** | Provider | providerId, amount, currency, payoutMethod, destinationAccount | Payout (pending) | -- | InsufficientBalanceError, InvalidAccountError |
| **ProcessPayout** | System (scheduled or on-demand) | payoutId | Payout (processing) | -- | NotFound, InvalidStateError |
| **CompletePayoutCallback** | System (webhook from M-Pesa/e-Mola/bank) | payoutId, gatewayReference, success, failureReason? | Updated Payout | PayoutCompleted or PayoutFailed | NotFound |
| **GetProviderBalance** | Provider | providerId | { available: number, pending: number, currency: string } | -- | NotFound |

---

## 7. Repository Ports

```typescript
interface PaymentIntentRepository {
  findById(id: string): Promise<PaymentIntent | null>;
  findByBooking(bookingId: string): Promise<PaymentIntent | null>;
  findBySubscriptionBilling(billingId: string): Promise<PaymentIntent | null>;
  findByCustomer(customerId: string, pagination: { limit: number; offset: number }): Promise<{ intents: PaymentIntent[]; total: number }>;
  findExpired(): Promise<PaymentIntent[]>;
  findPendingByBooking(bookingId: string): Promise<PaymentIntent | null>;
  save(intent: PaymentIntent): Promise<void>;
}

interface PaymentTransactionRepository {
  findById(id: string): Promise<PaymentTransaction | null>;
  findByIntent(intentId: string): Promise<PaymentTransaction[]>;
  findByGatewayReference(ref: string): Promise<PaymentTransaction | null>;
  save(transaction: PaymentTransaction): Promise<void>;
}

interface PayoutRepository {
  findById(id: string): Promise<Payout | null>;
  findByProvider(providerId: string, pagination: { limit: number; offset: number }): Promise<{ payouts: Payout[]; total: number }>;
  findPendingForProcessing(): Promise<Payout[]>;
  save(payout: Payout): Promise<void>;
}

interface ProviderBalanceRepository {
  getBalance(providerId: string): Promise<{ available: number; pending: number; currency: string }>;
  creditEarnings(providerId: string, amount: number, currency: string, paymentIntentId: string): Promise<void>;
  debitPayout(providerId: string, amount: number, currency: string, payoutId: string): Promise<void>;
}
```

### External Service Ports (ACL Pattern)

```typescript
/**
 * Anti-Corruption Layer: translates external payment processor
 * responses into domain-level results. Each implementation
 * wraps a specific provider SDK (M-Pesa, e-Mola, Stripe).
 */
interface PaymentGateway {
  authorize(params: {
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    customerPhone?: string;  // for M-Pesa / e-Mola
    cardToken?: string;      // for Stripe
    metadata?: Record<string, string>;
  }): Promise<GatewayResult>;

  capture(gatewayReference: string, amount: number): Promise<GatewayResult>;

  refund(gatewayReference: string, amount: number, reason?: string): Promise<GatewayResult>;
}

interface GatewayResult {
  success: boolean;
  gatewayReference: string | null;
  failureReason: string | null;
  failureCode: string | null;
  rawResponse: Record<string, unknown>;
}

/**
 * Payout service ACL: translates external payout processor
 * responses into domain results.
 */
interface PayoutService {
  sendMPesa(params: {
    phoneNumber: string;
    amount: number;
    currency: string;
    reference: string;
  }): Promise<PayoutResult>;

  sendEMola(params: {
    phoneNumber: string;
    amount: number;
    currency: string;
    reference: string;
  }): Promise<PayoutResult>;

  sendBank(params: {
    accountNumber: string;
    bankCode: string;
    amount: number;
    currency: string;
    reference: string;
  }): Promise<PayoutResult>;
}

interface PayoutResult {
  success: boolean;
  gatewayReference: string | null;
  failureReason: string | null;
  rawResponse: Record<string, unknown>;
}
```

---

## 8. Entity Schemas

### Drizzle ORM Schema

```typescript
import {
  pgTable, uuid, varchar, text, jsonb, boolean, timestamp,
  decimal, integer, index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Payment Intents ───────────────────────────────────────

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id'),
    subscriptionBillingId: uuid('subscription_billing_id'),
    customerId: uuid('customer_id').notNull(),
    providerId: uuid('provider_id').notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    platformFee: decimal('platform_fee', { precision: 12, scale: 2 }).notNull(),
    providerEarnings: decimal('provider_earnings', { precision: 12, scale: 2 }).notNull(),
    tipAmount: decimal('tip_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    paymentMethod: varchar('payment_method', { length: 20 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    escrowHeld: boolean('escrow_held').notNull().default(false),
    escrowReleasedAt: timestamp('escrow_released_at', { withTimezone: true }),
    refundAmount: decimal('refund_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    refundReason: text('refund_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payment_intents_booking').on(table.bookingId),
    index('idx_payment_intents_sub_billing').on(table.subscriptionBillingId),
    index('idx_payment_intents_customer').on(table.customerId),
    index('idx_payment_intents_provider').on(table.providerId),
    index('idx_payment_intents_status').on(table.status),
    index('idx_payment_intents_expires_at').on(table.expiresAt),
    index('idx_payment_intents_escrow').on(table.escrowHeld, table.escrowReleasedAt),
    check('intent_status_check', sql`${table.status} IN ('pending','processing','completed','failed','cancelled','expired')`),
    check('intent_amount_positive', sql`${table.amount} > 0`),
    check('intent_fee_non_negative', sql`${table.platformFee} >= 0`),
    check('intent_earnings_non_negative', sql`${table.providerEarnings} >= 0`),
    check('intent_tip_non_negative', sql`${table.tipAmount} >= 0`),
    check('intent_refund_non_negative', sql`${table.refundAmount} >= 0`),
    check('intent_refund_max', sql`${table.refundAmount} <= ${table.amount}`),
    check('payment_method_check', sql`${table.paymentMethod} IS NULL OR ${table.paymentMethod} IN ('mpesa','emola','card')`),
    check('intent_reference_check', sql`(${table.bookingId} IS NOT NULL AND ${table.subscriptionBillingId} IS NULL) OR (${table.bookingId} IS NULL AND ${table.subscriptionBillingId} IS NOT NULL)`),
  ],
);

// ── Payment Transactions ──────────────────────────────────

export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(),
    paymentMethod: varchar('payment_method', { length: 20 }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    gatewayReference: varchar('gateway_reference', { length: 255 }),
    gatewayResponse: jsonb('gateway_response'),
    failureReason: text('failure_reason'),
    failureCode: varchar('failure_code', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_txn_payment_intent').on(table.paymentIntentId),
    index('idx_txn_gateway_ref').on(table.gatewayReference),
    index('idx_txn_status').on(table.status),
    index('idx_txn_type').on(table.type),
    check('txn_type_check', sql`${table.type} IN ('authorization','capture','refund')`),
    check('txn_status_check', sql`${table.status} IN ('pending','success','failed')`),
    check('txn_method_check', sql`${table.paymentMethod} IN ('mpesa','emola','card')`),
    check('txn_amount_positive', sql`${table.amount} > 0`),
  ],
);

// ── Payouts ───────────────────────────────────────────────

export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    payoutMethod: varchar('payout_method', { length: 20 }).notNull(),
    destinationAccount: varchar('destination_account', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    gatewayReference: varchar('gateway_reference', { length: 255 }),
    failureReason: text('failure_reason'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payouts_provider').on(table.providerId),
    index('idx_payouts_status').on(table.status),
    index('idx_payouts_created_at').on(table.createdAt),
    check('payout_status_check', sql`${table.status} IN ('pending','processing','completed','failed')`),
    check('payout_method_check', sql`${table.payoutMethod} IN ('mpesa','emola','bank_transfer')`),
    check('payout_amount_positive', sql`${table.amount} > 0`),
  ],
);

// ── Provider Balances ─────────────────────────────────────

export const providerBalances = pgTable(
  'provider_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull().unique(),
    availableAmount: decimal('available_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    pendingAmount: decimal('pending_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    currency: varchar('currency', { length: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_provider_balances_provider').on(table.providerId),
    check('balance_available_non_negative', sql`${table.availableAmount} >= 0`),
    check('balance_pending_non_negative', sql`${table.pendingAmount} >= 0`),
  ],
);

// ── Balance Ledger (audit trail) ──────────────────────────

export const balanceLedger = pgTable(
  'balance_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    referenceType: varchar('reference_type', { length: 30 }).notNull(),
    referenceId: uuid('reference_id').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ledger_provider').on(table.providerId),
    index('idx_ledger_type').on(table.type),
    index('idx_ledger_reference').on(table.referenceType, table.referenceId),
    index('idx_ledger_created_at').on(table.createdAt),
    check('ledger_type_check', sql`${table.type} IN ('escrow_hold','escrow_release','payout_debit','tip_credit','refund_debit','commission_deduction')`),
    check('ledger_ref_type_check', sql`${table.referenceType} IN ('payment_intent','payout','tip')`),
  ],
);
```

---

## 9. Business Rules & Invariants

### Payment Intent Rules

| # | Rule | Enforcement |
|---|------|-------------|
| PI1 | Payment intent must reference exactly one of booking or subscription billing (XOR constraint). | Domain validation in `PaymentIntent.create()` + DB CHECK constraint |
| PI2 | `platform_fee + provider_earnings = amount`. | Domain invariant enforced at creation |
| PI3 | Payment timeout is 30 minutes by default, configurable per intent. Expired intents cannot accept new transactions. | `expires_at` field + domain checks in `initiate()` and `retry()` |
| PI4 | Failed payments can be retried with the same or different payment method within the timeout window. | Domain logic in `PaymentIntent.retry()` |
| PI5 | Refund amount cannot exceed the original payment amount. | Domain check in `PaymentIntent.refund()` + DB CHECK |
| PI6 | Tips are not subject to platform commission. 100% of tip goes to provider earnings. | `tipAmount` tracked separately, added to provider balance without fee deduction |
| PI7 | Escrow must be held before it can be released. Release happens on customer confirmation or 24h auto-confirm. | Boolean `escrow_held` flag + domain checks |

### Refund Policy Rules

| Time Before Scheduled Start | Customer Refund % | Rule |
|-----------------------------|-------------------|------|
| 24+ hours | 100% | Full refund |
| 12-24 hours | 75% | 75% refund |
| 2-12 hours | 50% | 50% refund |
| < 2 hours | 0% | No refund |
| Provider cancels (any time) | 100% | Full refund always |

### Payout Rules

| # | Rule | Enforcement |
|---|------|-------------|
| PO1 | Provider can only withdraw from available (released) balance, not pending (escrowed) balance. | `ProviderBalanceRepository.getBalance()` check in `RequestPayout` use case |
| PO2 | Payout destination is validated per method: M-Pesa/e-Mola require valid Mozambican phone (+258...), bank requires valid account number + bank code. | Domain validation in `RequestPayout` use case |
| PO3 | Failed payouts do not deduct from provider balance. The amount is re-credited on failure. | Compensating ledger entry on `PayoutFailed` |
| PO4 | Minimum payout amount enforced per method (e.g., 50 MZN for M-Pesa). | Configurable threshold checked in `RequestPayout` |

### Balance & Ledger Rules

| # | Rule | Enforcement |
|---|------|-------------|
| BL1 | Every balance mutation creates a ledger entry for audit trail. | Application service wraps balance updates with ledger writes in a single transaction |
| BL2 | Available balance can never go negative. | DB CHECK constraint + domain validation |
| BL3 | Pending balance increases on escrow hold, decreases on escrow release or refund. | Ledger-driven balance reconciliation |
| BL4 | Ledger entries are append-only and immutable. | No UPDATE/DELETE operations on ledger table |

### Subscription Payment Rules

| # | Rule | Enforcement |
|---|------|-------------|
| SP1 | Subscription billing creates a payment intent with the subscription's locked `price_per_cycle`. | `CreatePaymentIntent` called by Booking BC via `SubscriptionRenewed` event |
| SP2 | Failed subscription payments retry up to 3 times over 7 days before the subscription expires. | Booking BC manages retry count; Payment BC processes each attempt as a new intent |
| SP3 | Subscription payment intents use a longer timeout (24h) compared to booking payments (30min). | Configurable `timeoutMinutes` parameter in `CreatePaymentIntent` |

---

## 10. Cross-Context Dependencies

### Upstream Dependencies (Depends On)

| Source BC | What Payment Needs | How It Gets It |
|-----------|-------------------|----------------|
| **User** | Customer and provider identity for payment processing, provider payout account details (phone, bank) | Consumes `ProviderVerified` to initialize provider balance record. Queries User BC read models for payout destination details |

### Partnership

| Partner BC | Relationship | Events Exchanged |
|-----------|-------------|------------------|
| **Booking** | Mutual dependency. Booking triggers payment intent creation; Payment reports results back. Neither BC writes to the other's data store. | Booking publishes: `BookingPendingPayment`, `BookingCompleted` (triggers escrow release), `BookingCancelled` (triggers refund), `BookingDisputed` (holds escrow), `SubscriptionRenewed` (triggers subscription payment). Payment publishes: `PaymentProcessed`, `PaymentFailed`, `PaymentExpired`, `PaymentRefunded` |

### Downstream Dependents (Depended On By)

| Consuming BC | What It Needs | How It Gets It |
|-------------|---------------|----------------|
| **Communication** | Payment success, failure, refund, and payout completion for notifications | Consumes `PaymentProcessed`, `PaymentFailed`, `PaymentRefunded`, `PayoutCompleted`, `TipAdded` events |

### Events Published (Summary)

| Event | Consumers |
|-------|-----------|
| `PaymentProcessed` | Booking (confirm booking / mark billing paid), Communication |
| `PaymentFailed` | Booking (handle retry / expiration), Communication |
| `PaymentExpired` | Booking (expire booking), Communication |
| `PaymentRefunded` | Booking (record refund), Communication |
| `EscrowReleased` | Internal (credit provider balance) |
| `TipAdded` | Internal (credit provider balance), Communication |
| `PayoutCompleted` | Communication |
| `PayoutFailed` | Communication, Admin review |

### Events Subscribed

| Event | Source BC | Handler |
|-------|----------|---------|
| `ProviderVerified` | User | Initialize a `provider_balances` record for the newly verified provider (balance starts at 0). Only providers need balance tracking, not regular customers. |
| `BookingPendingPayment` | Booking | Create a `PaymentIntent` with the booking's total amount, platform fee, and 30-minute timeout. |
| `BookingCompleted` | Booking | Mark escrow as eligible for release. Start 24-hour auto-confirm countdown (handled by Booking BC; Payment releases on confirmation event). |
| `BookingCancelled` | Booking | If payment was completed, calculate refund per cancellation policy and call `ProcessRefund`. If payment was pending/processing, call `CancelPaymentIntent`. |
| `BookingDisputed` | Booking | Hold escrow (prevent automatic release) until dispute is resolved. |
| `SubscriptionRenewed` | Booking | Create a `PaymentIntent` for the subscription billing cycle amount with 24-hour timeout. |

### Integration Pattern

The Payment BC uses the **Conformist** pattern upstream with User BC, accepting User's identity model as-is for customer and provider identification.

With Booking BC, the relationship is **Partnership**: both BCs evolve together with synchronized event contracts. Booking creates payment intents via events; Payment processes them and reports results back via events. Neither BC writes directly to the other's data store.

For external payment processors (M-Pesa, e-Mola, Stripe), the Payment BC uses the **Anti-Corruption Layer** pattern. Each processor has a dedicated adapter implementing the `PaymentGateway` or `PayoutService` port interface. The ACL translates processor-specific request/response formats into domain-level `GatewayResult` and `PayoutResult` objects, isolating the domain from external API changes.

Downstream, Payment uses the **Published Language** pattern, emitting well-defined domain events that Communication BC consumes for notification delivery.
