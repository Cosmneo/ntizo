# Context Map

## BC Landscape

```
                              ┌──────────────────┐
                              │                  │
                    ┌────────►│      USER        │◄────────┐
                    │         │  (Foundation)    │         │
                    │         └──────┬───────────┘         │
                    │                │                      │
                    │         Publishes:                    │
                    │         UserRegistered                │
                    │         ProviderVerified              │
                    │         OrganizationCreated               │
                    │         OrganizationVerified              │
                    │         StaffMemberAdded              │
                    │                │                      │
              ┌─────┴──────┐  ┌─────┴──────┐   ┌──────────┴──┐
              │            │  │            │   │             │
              │  CATALOG   │  │ SCHEDULING │   │   PRICING   │
              │            │  │            │   │             │
              └─────┬──────┘  └─────┬──────┘   └──────┬──────┘
                    │               │                  │
              Publishes:      Publishes:          Publishes:
              ServicePublished SlotReserved       QuoteResponded
              ServiceApproved  SlotReleased       QuoteAccepted
                    │          SlotsRegenerated    DiscountApplied
                    │               │                  │
                    └───────┬───────┴──────────┬───────┘
                            │                  │
                            ▼                  ▼
                    ┌──────────────┐    ┌──────────────┐
                    │              │    │              │
                    │   BOOKING    │◄──►│   PAYMENT    │
                    │ (Orchestrator)│   │ (Partnership)│
                    │              │    │              │
                    └──────┬───────┘    └──────────────┘
                           │
                    Publishes:
                    BookingCreated
                    BookingConfirmed
                    BookingCompleted
                    BookingCancelled
                    RecurrenceCreated
                    SubscriptionCreated
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌──────────────┐  ┌──────────┐
      │              │  │          │
      │COMMUNICATION │  │  REVIEW  │
      │              │  │          │
      └──────────────┘  └──────────┘
```

## Relationship Patterns

### Pattern Types Used

| Pattern | Description | When Used |
|---------|-------------|-----------|
| **Conformist** | Downstream accepts upstream's model as-is | Review, Communication consuming User/Booking events |
| **Published Language** | Shared event schemas all BCs agree on | Domain events (e.g., BookingCreated payload) |
| **Customer/Supplier** | Upstream adapts to downstream needs | Scheduling supplies slots to Booking |
| **Partnership** | Two BCs evolve together, mutual dependency | Booking <-> Payment |
| **Anti-Corruption Layer (ACL)** | Downstream translates upstream model | Payment adapting external processor responses |

## Per-BC Relationship Table

### User BC (Upstream to all)

| Direction | Related BC | Pattern | Events Published | Events Subscribed |
|-----------|-----------|---------|-----------------|-------------------|
| Downstream | Catalog | Published Language | UserRegistered, ProviderVerified | - |
| Downstream | Scheduling | Published Language | OrganizationCreated, StaffMemberAdded, StaffMemberRemoved | - |
| Downstream | Pricing | Published Language | ProviderVerified | - |
| Downstream | Booking | Published Language | UserRegistered, ProviderVerified, OrganizationVerified | - |
| Downstream | Payment | Published Language | UserRegistered | - |
| Downstream | Communication | Published Language | UserRegistered | - |
| Downstream | Review | Published Language | UserRegistered | - |

### Catalog BC

| Direction | Related BC | Pattern | Events Published | Events Subscribed |
|-----------|-----------|---------|-----------------|-------------------|
| Upstream | User | Conformist | - | ProviderVerified (enable publishing) |
| Downstream | Scheduling | Published Language | ServicePublished (trigger slot generation) | - |
| Downstream | Booking | Published Language | ServicePublished, ServiceApproved | - |
| Downstream | Pricing | Published Language | ServicePublished | - |

### Scheduling BC

| Direction | Related BC | Pattern | Events Published | Events Subscribed |
|-----------|-----------|---------|-----------------|-------------------|
| Upstream | User | Conformist | - | OrganizationCreated, StaffMemberAdded, StaffMemberRemoved |
| Upstream | Catalog | Conformist | - | ServicePublished (service duration/buffer for slot generation) |
| Downstream | Booking | Customer/Supplier | SlotReserved, SlotReleased, SlotsRegenerated | BookingConfirmed (reserve), BookingCancelled (release) |

### Pricing BC

| Direction | Related BC | Pattern | Events Published | Events Subscribed |
|-----------|-----------|---------|-----------------|-------------------|
| Upstream | User | Conformist | - | ProviderVerified |
| Upstream | Catalog | Conformist | - | ServicePublished |
| Downstream | Booking | Published Language | QuoteAccepted (triggers booking creation), DiscountApplied | QuoteRequested |

### Booking BC (Central Orchestrator)

| Direction | Related BC | Pattern | Events Published | Events Subscribed |
|-----------|-----------|---------|-----------------|-------------------|
| Upstream | User | Conformist | - | UserRegistered |
| Upstream | Catalog | Conformist | - | ServicePublished |
| Upstream | Scheduling | Customer/Supplier | BookingConfirmed, BookingCancelled, BookingExpired | SlotReserved, SlotReleased |
| Upstream | Pricing | Conformist | - | QuoteAccepted, DiscountApplied |
| Partnership | Payment | Partnership | BookingPendingPayment, BookingCompleted, BookingCancelled | PaymentProcessed, PaymentFailed, PaymentExpired |
| Downstream | Communication | Published Language | BookingCreated, BookingConfirmed, BookingCancelled, BookingCompleted | - |
| Downstream | Review | Published Language | BookingCompleted | - |

### Payment BC

| Direction | Related BC | Pattern | Events Published | Events Subscribed |
|-----------|-----------|---------|-----------------|-------------------|
| Upstream | User | Conformist | - | UserRegistered |
| Partnership | Booking | Partnership | PaymentProcessed, PaymentFailed, PaymentExpired, PaymentRefunded | BookingPendingPayment, BookingCompleted, BookingCancelled, SubscriptionRenewed |
| External | M-Pesa, e-Mola, Stripe | ACL | - | Webhook events (translated via adapters) |

### Communication BC

| Direction | Related BC | Pattern | Events Published | Events Subscribed |
|-----------|-----------|---------|-----------------|-------------------|
| Upstream | User | Conformist | - | UserRegistered |
| Upstream | Booking | Conformist | - | BookingCreated, BookingConfirmed, BookingCancelled, BookingCompleted, RecurrenceCreated, SubscriptionCreated |
| Upstream | Pricing | Conformist | - | QuoteRequested, QuoteResponded, QuoteAccepted, QuoteExpired |
| Upstream | Payment | Conformist | - | PaymentProcessed, PayoutCompleted |
| Upstream | Review | Conformist | - | ReviewSubmitted |

### Review BC

| Direction | Related BC | Pattern | Events Published | Events Subscribed |
|-----------|-----------|---------|-----------------|-------------------|
| Upstream | User | Conformist | - | UserRegistered |
| Upstream | Booking | Conformist | - | BookingCompleted (enable review submission) |
| Downstream | User | Published Language | ReviewSubmitted (update average ratings) | - |

## Event Flow Examples

### Flow 1: Package Booking (Path A)

```
Customer selects package → selects slot → submits booking

1. [Booking]  BookingCreated
                ├──► [Communication] Send notification to provider
                └──► [Booking] Create booking snapshot

2. Provider accepts
   [Booking]  BookingPendingPayment
                └──► [Payment] CreatePaymentIntent (start 30-min timer)

3. Customer pays via M-Pesa
   [Payment]  PaymentProcessed
                └──► [Booking] ConfirmBooking
                       ├──► [Scheduling] ReserveSlotCapacity → SlotReserved
                       └──► [Communication] Notify both parties

4. Provider marks started
   [Booking]  BookingStarted
                └──► [Communication] Notify customer

5. Provider marks completed
   [Booking]  BookingCompleted
                ├──► [Communication] Notify customer (24h to confirm/dispute)
                └──► [Review] Enable review submission

6. Customer confirms (or auto-confirm after 24h)
   [Payment]  Release escrow → calculate commission → credit provider
   [Review]   Prompt customer for review

7. Customer submits review
   [Review]   ReviewSubmitted
                └──► [User] Update provider average rating
```

### Flow 2: Custom Quote (Path C)

```
Customer visits provider profile → requests custom quote

1. [Pricing]  QuoteRequested
                └──► [Communication] Notify provider

2. Provider responds with price breakdown
   [Pricing]  QuoteResponded
                └──► [Communication] Notify customer

3. (Optional) Negotiation via chat
   [Communication] Messages exchanged

4. Customer accepts quote
   [Pricing]  QuoteAccepted
                └──► [Booking] BookFromQuote → BookingCreated
                       └──► Same flow as Package Booking from step 2

5. OR: Quote expires after 48h
   [Pricing]  QuoteExpired
                └──► [Communication] Notify both parties
```

### Flow 3: Task Bidding (Path D)

```
Customer posts a task publicly

1. [Booking]  TaskPosted
                └──► [Communication] Notify matching providers

2. Provider submits bid
   [Booking]  BidSubmitted
                └──► [Communication] Notify customer

3. Customer reviews bids → accepts one
   [Booking]  BidAccepted
                ├──► [Booking] BookFromBid → BookingCreated
                ├──► [Booking] Reject all other bids
                └──► Same flow as Package Booking from step 2
```

### Flow 4: Recurring Booking

```
Customer creates recurring weekly cleaning

1. [Booking]  RecurrenceCreated
                ├──► Generate first 4 booking occurrences
                ├──► Each: BookingCreated → same lifecycle
                └──► [Communication] Notify provider of recurring series

2. Each occurrence follows independent lifecycle:
   BookingCreated → BookingPendingPayment → BookingConfirmed → ... → BookingCompleted

3. After current occurrence completes:
   [Booking]  GenerateNextOccurrence
                └──► BookingCreated (for the next slot in the series)

4. Customer skips one occurrence:
   [Booking]  RecurrenceOccurrenceSkipped
                └──► [Scheduling] ReleaseSlotCapacity (if slot was reserved)

5. Customer cancels series:
   [Booking]  RecurrenceCancelled
                ├──► Cancel all future pending bookings
                └──► [Communication] Notify provider
```

### Flow 5: Subscription

```
Customer subscribes to "Monthly Accounting Basic" plan

1. [Booking]  SubscriptionCreated
                └──► [Payment] CreatePaymentIntent (first billing cycle)

2. Payment succeeds
   [Payment]  PaymentProcessed
                └──► [Booking] Activate subscription (status: active)
                       └──► [Communication] Notify both parties

3. Billing cycle ends → auto-renew
   [Booking]  SubscriptionRenewed
                └──► [Payment] CreatePaymentIntent (next cycle)

4. If payment fails:
   [Payment]  PaymentFailed
                └──► [Booking] SubscriptionBillingFailed
                       ├──► Increment retry count
                       ├──► Schedule retry (up to 3 attempts over 7 days)
                       └──► [Communication] Notify customer

5. After max retries:
   [Booking]  SubscriptionExpired
                └──► [Communication] Notify both parties

6. Customer pauses:
   [Booking]  SubscriptionPaused → stop billing

7. Customer resumes:
   [Booking]  SubscriptionResumed → resume from next cycle

8. Customer cancels:
   [Booking]  SubscriptionCancelled
                └──► Effective at end of current billing period
```

### Flow 6: Organization Multi-Staff Booking

```
Customer books "Men's Haircut" at a barbershop with 3 barbers

1. [Scheduling] GetAvailableSlots
                  ├──► Check organization operating hours
                  ├──► Check each staff member's availability
                  └──► Return slots with capacity (e.g., 10:00 → capacity: 3)

2. Customer selects 10:00 slot
   [Booking]  BookingCreated (auto-assign to available staff member)
                └──► [Scheduling] Check slot capacity (3 total, 1 booked → 2 available)

3. Provider accepts → Payment → Confirmed
   [Scheduling] ReserveSlotCapacity
                  └──► Slot at 10:00: capacity=3, booked=2, available=1

4. Third customer books 10:00
   [Scheduling] ReserveSlotCapacity
                  └──► Slot at 10:00: capacity=3, booked=3, available=0

5. Fourth customer tries 10:00
   [Scheduling] SLOT FULL → next available: 10:40
```

## Integration Patterns Summary

```
┌────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER                        │
│                                                            │
│   Internal (Domain Events):                                │
│   ┌──────────┐    Event Bus     ┌──────────┐              │
│   │ Publisher │ ──────────────► │Subscriber│              │
│   └──────────┘  (in-process or  └──────────┘              │
│                  async queue)                               │
│                                                            │
│   External (ACL):                                          │
│   ┌──────────┐   ┌─────┐   ┌──────────────┐              │
│   │  Domain  │──►│ ACL │──►│External API  │              │
│   └──────────┘   └─────┘   └──────────────┘              │
│                     │                                      │
│              Translates external                           │
│              models to domain                              │
│              models                                        │
│                                                            │
│   ACLs used for:                                           │
│   - M-Pesa API → PaymentTransaction                       │
│   - e-Mola API → PaymentTransaction                       │
│   - Stripe API → PaymentTransaction                       │
│   - Better Auth → User/Session                             │
│   - Google Maps → Location VO                              │
│   - Firebase → Notification                                │
│   - Twilio → SMS delivery                                  │
│   - SendGrid → Email delivery                              │
└────────────────────────────────────────────────────────────┘
```
