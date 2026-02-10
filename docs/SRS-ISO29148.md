# Software Requirements Specification (SRS)
## Ntizo - Service Marketplace Platform

| Document ID | NTIZO-SRS-001 |
|-------------|---------------|
| Version | 3.1 |
| Date | 2026-02-06 |
| Status | Draft |
| Standard | ISO/IEC/IEEE 29148:2018 |

---

# 1. INTRODUCTION

## 1.1 Purpose

This Software Requirements Specification (SRS) describes the functional and non-functional requirements for the **Ntizo Service Marketplace Platform** following ISO/IEC/IEEE 29148:2018 standard.

**Intended Audience:**
- Development team
- Project managers
- Quality assurance team
- Stakeholders and investors

## 1.2 Scope

**Product Name:** Ntizo

**Description:** Global two-sided service marketplace connecting customers with verified service providers — both individuals and organizations — for task completion. Supports multiple service delivery modes (at customer, at provider, remote), flexible pricing, and slot-based scheduling.

**Objectives:**
| ID | Objective |
|----|-----------|
| OBJ-001 | Launch MVP in Mozambique |
| OBJ-002 | Onboard 1,000 providers in 6 months |
| OBJ-003 | Process 10,000 bookings in first year |
| OBJ-004 | Achieve 4.0+ average rating |
| OBJ-005 | Expand to 3 countries in 2 years |

**In Scope:**
- User authentication (Better Auth)
- Service provider profiles and verification
- Service catalog and search
- Direct booking and task bidding
- In-app messaging
- Payments (M-Pesa, e-Mola, cards)
- Reviews and ratings
- Admin portal
- Organization/establishment profiles and management
- Staff member management for organizations
- Service location types (at_customer, at_provider, remote, flexible)
- Rule-based availability model (weekly recurring, date range, one-time rules)
- Persisted slot capacity tracking with auto-generation
- Service lifecycle with admin approval
- Payment intent pattern with transaction tracking
- Booking snapshot for audit trail

**Out of Scope:**
- Physical logistics/delivery
- Employment relationships
- Financial lending
- Insurance provision

## 1.3 Product Overview

### 1.3.1 Product Perspective

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SYSTEMS                          │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│  M-Pesa  │  e-Mola  │ Stripe   │  Google  │  SMS/Email     │
│   API    │   API    │   API    │  Maps    │  Services      │
└──────────┴──────────┴──────────┴──────────┴────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    NTIZO PLATFORM                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐     │
│  │  Web App   │  │Mobile Apps │  │   Admin Portal     │     │
│  └────────────┘  └────────────┘  └────────────────────┘     │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Better Auth + API Layer                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               Database & Storage                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌──────────┐       ┌─────────┐
   │Customer │       │ Provider │       │  Admin  │
   └─────────┘       └──────────┘       └─────────┘
```

### 1.3.2 Product Functions

| ID | Function | Description |
|----|----------|-------------|
| PF-01 | Authentication | Via Better Auth |
| PF-02 | User Management | Profiles |
| PF-03 | Service Catalog | Categories, packages |
| PF-04 | Search | Discovery |
| PF-05 | Package Booking | Book fixed-price packages (Path A) |
| PF-06 | Hourly Booking | Book by the hour (Path B) |
| PF-07 | Custom Quotes | Request/respond to personalized quotes (Path C) |
| PF-08 | Task Posting | Post tasks for bids (Path D) |
| PF-09 | Bidding | Provider proposals on tasks |
| PF-10 | Volume Discounts | Hours/days/recurring discount rules |
| PF-11 | Messaging | In-app chat + quote negotiation |
| PF-12 | Payments | Process transactions, escrow |
| PF-13 | Payouts | Provider withdrawals |
| PF-14 | Reviews | Ratings |
| PF-15 | Verification | Provider ID |
| PF-16 | Administration | Platform management |
| PF-17 | Organization Management | Establishment profiles, staff |
| PF-18 | Scheduling | Rule-based availability with persisted slot capacity |
| PF-19 | Service Lifecycle | Draft → approval → published workflow |
| PF-20 | Payment Intent | Payment lifecycle with retry and transaction tracking |
| PF-21 | Booking Snapshot | Immutable capture of service/slot/pricing at booking time |
| PF-22 | Recurring Bookings | Auto-generated repeating booking series (weekly/biweekly/monthly) |
| PF-23 | Subscriptions | Ongoing service subscriptions with auto-billing |

### 1.3.3 User Characteristics

| User | Description | Tech Level | Frequency |
|------|-------------|------------|-----------|
| Customer | Service seekers | Low-Medium | Weekly |
| Provider | Service professionals | Low-Medium | Daily |
| Admin | Operations staff | Medium-High | Daily |
| Organization Owner | Establishment operators | Low-Medium | Daily |

### 1.3.4 Assumptions

| ID | Assumption |
|----|------------|
| ASM-001 | Users have Android 8+ or iOS 13+ |
| ASM-002 | Users have mobile money or bank cards |
| ASM-003 | Providers can provide valid ID |
| ASM-004 | Payment APIs available in Mozambique |

### 1.3.5 Dependencies

| ID | Dependency |
|----|------------|
| DEP-001 | Better Auth library |
| DEP-002 | M-Pesa API access |
| DEP-003 | e-Mola API access |
| DEP-004 | Cloud infrastructure |
| DEP-005 | Firebase Cloud Messaging |

## 1.4 Definitions

| Term | Definition |
|------|------------|
| Booking | Confirmed customer-provider arrangement |
| Booking Path | One of 4 ways to create a booking: Package (A), Hourly (B), Custom Quote (C), Task Bid (D) |
| Bid | Provider proposal for a posted task (Path D) |
| Custom Quote | Personalized price from a specific provider in response to a customer request (Path C) |
| Customer | User seeking services |
| Discount Rule | Provider-configured volume discount (hours, days, recurring, first-time) |
| Escrow | Payment holding until completion |
| Package | Pre-defined service offering with fixed price, created by provider |
| Payout | Provider withdrawal |
| Provider | User offering services |
| Quote Request | Customer request for personalized pricing from a specific provider |
| Service | A category-linked offering that can have packages, hourly rate, or custom quotes |
| Task | Customer work request posted publicly for multiple providers to bid on (Path D) |
| Volume Discount | Price reduction applied when booking exceeds a threshold (hours, days, etc.) |
| Organization | An establishment (salon, workshop, etc.) with a fixed location, created by a user |
| Organization Member | A user who is part of an organization team (owner, manager, staff) |
| Service Location Type | Where a service happens: at_customer, at_provider, remote, or flexible |
| Slot | A persisted bookable time window with capacity tracking, generated from availability rules + service duration + buffer |
| Buffer Time | Rest/travel/cleanup time between consecutive appointments |
| Availability Rule | A scheduling rule defining when a provider/organization/staff is available (weekly recurring, date range, or one-time) |
| Availability Exception | A date-specific override: blocked (no slots) or special (custom hours) |
| Time Window | A start/end time pair (HH:mm) within an availability rule, supporting multiple windows per day |
| Scheduling Config | Per-owner settings: advance booking days, cutoff hours, buffer minutes, timezone |
| Booking Snapshot | Immutable JSON capture of service details, slot time, and pricing breakdown at booking time |
| Payment Intent | A payment lifecycle aggregate (pending → processing → completed/failed/expired) separate from the booking |
| Payment Transaction | An individual payment attempt or refund within a payment intent |
| Service Lifecycle | The approval workflow: draft → pending_approval → approved → published (with rejected, unpublished, archived) |
| Recurring Booking | A repeating series of individual bookings following a pattern (weekly, biweekly, monthly), each with its own slot and lifecycle |
| Booking Recurrence | The pattern definition for a recurring booking series (frequency, day, time, location) |
| Subscription Plan | A provider-defined offering for ongoing services with periodic billing (monthly, quarterly, annual) |
| Service Subscription | A customer's active subscription to a provider's plan, with auto-renewal |
| Subscription Billing | A single billing cycle record within a subscription, linked to a payment intent |

---

# 2. REFERENCES

| ID | Document |
|----|----------|
| REF-001 | ISO/IEC/IEEE 29148:2018 |
| REF-002 | Better Auth Documentation |
| REF-003 | OWASP Top 10 (2021) |
| REF-004 | PCI DSS v4.0 |
| REF-005 | Onion-Lasagna Architecture (github.com/Cosmneo/onion-lasagna) |
| REF-006 | Domain-Driven Design (Eric Evans) |

---

# 3. SPECIFIC REQUIREMENTS

## 3.0 Architecture Requirements

### 3.0.1 Architecture Pattern

The system shall implement **Hexagonal Architecture** (Ports & Adapters) using the **onion-lasagna** library, following Domain-Driven Design (DDD) principles.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                               │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│    │  HTTP API   │  │  Mobile BFF │  │  Admin API  │  │  WebSocket  │   │
│    │   (Hono)    │  │             │  │             │  │             │   │
│    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │
└───────────┼────────────────┼────────────────┼────────────────┼──────────┘
            │                │                │                │
            ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                                 │
│                         (Use Cases / Orchestrations)                     │
│    ┌───────────────────────────────────────────────────────────────┐    │
│    │  CreateBooking │ SubmitBid │ ProcessPayment │ VerifyProvider  │    │
│    └───────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DOMAIN LAYER                                    │
│                    (Bounded Contexts / Core Logic)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Booking   │  │   Payment   │  │   User      │  │   Catalog   │     │
│  │   Context   │  │   Context   │  │   Context   │  │   Context   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Entities │ Value Objects │ Aggregates │ Domain Events │ Services │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       INFRASTRUCTURE LAYER                               │
│                         (Ports & Adapters)                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ PostgreSQL │  │ Better Auth│  │   M-Pesa   │  │   e-Mola   │        │
│  │  Adapter   │  │  Adapter   │  │  Adapter   │  │  Adapter   │        │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │   Stripe   │  │   AWS S3   │  │  Firebase  │  │   Twilio   │        │
│  │  Adapter   │  │  Adapter   │  │  Adapter   │  │  Adapter   │        │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.0.2 Bounded Contexts

| Context | Responsibility | Key Aggregates |
|---------|---------------|----------------|
| **User** | Authentication, profiles, verification, organizations | User, Profile, Organization, OrganizationMember |
| **Catalog** | Services, categories, packages, service location types | ServiceCategory, Service, ServicePackage |
| **Scheduling** | Availability rules, time windows, slot generation & capacity, exceptions, scheduling config | AvailabilityRule, AvailabilityTimeWindow, AvailabilityException, Slot, SchedulingConfig |
| **Pricing** | Custom quotes, discount rules, price calculation | QuoteRequest, QuoteResponse, DiscountRule |
| **Booking** | Bookings (all 4 paths), recurring series, subscriptions, tasks, bids, lifecycle | Booking, BookingRecurrence, TaskPost, Bid, SubscriptionPlan, ServiceSubscription, SubscriptionBilling |
| **Payment** | Payment intents, transactions, escrow, payouts | PaymentIntent, PaymentTransaction, Payout |
| **Communication** | Messaging, notifications, quote negotiation | Conversation, Message, Notification |
| **Review** | Ratings, reviews | Review |

### 3.0.3 Domain Model

#### Aggregates

| Aggregate | Root Entity | Entities | Value Objects |
|-----------|-------------|----------|---------------|
| **User** | User | Profile | Email, Phone, UserId, Name |
| **ServiceCategory** | ServiceCategory | Service, ServicePackage | CategoryId, ServiceId, PackageId |
| **QuoteRequest** | QuoteRequest | QuoteResponse | QuoteRequestId, QuoteResponseId |
| **DiscountRule** | DiscountRule | - | DiscountType, Threshold, Percentage |
| **Booking** | Booking | - | BookingId, BookingStatus, BookingPath, Location, Money, BookingSnapshot |
| **BookingRecurrence** | BookingRecurrence | - | RecurrenceId, Frequency, DayOfWeek |
| **SubscriptionPlan** | SubscriptionPlan | - | PlanId, BillingFrequency, Money |
| **ServiceSubscription** | ServiceSubscription | SubscriptionBilling | SubscriptionId, SubscriptionStatus, BillingPeriod |
| **TaskPost** | TaskPost | Bid | TaskId, BidId, Budget |
| **PaymentIntent** | PaymentIntent | PaymentTransaction | PaymentIntentId, PaymentMethod, Money, Currency |
| **Payout** | Payout | - | PayoutId, PayoutMethod |
| **Conversation** | Conversation | Message | ConversationId, MessageId |
| **Review** | Review | - | ReviewId, Rating |
| **Organization** | Organization | OrganizationMember | OrganizationId, OrganizationType, Address |
| **AvailabilityRule** | AvailabilityRule | AvailabilityTimeWindow | RuleType, DaysOfWeek, EffectivePeriod |
| **AvailabilityException** | AvailabilityException | ExceptionTimeWindow | ExceptionType, Date |
| **Slot** | Slot | - | SlotId, Capacity, BookedSpots, AvailableSpots |
| **SchedulingConfig** | SchedulingConfig | - | AdvanceBookingDays, CutoffHours, BufferMinutes, Timezone |

#### Value Objects (using onion-lasagna built-ins)

| Value Object | Type | Validation |
|--------------|------|------------|
| `UserId` | UUID | onion-lasagna UUID |
| `Email` | Email | onion-lasagna Email |
| `Phone` | Text | +258 format, validated |
| `Money` | Custom | Amount + Currency (MZN) |
| `Location` | Custom | Address + Lat + Lng |
| `Rating` | Number | 1-5 range |
| `BookingPath` | Enum | package, hourly, custom_quote, task_bid |
| `BookingStatus` | Enum | pending, pending_payment, confirmed, in_progress, completed, cancelled, disputed, expired |
| `PricingMode` | Enum | package, hourly, quote |
| `QuoteStatus` | Enum | pending, quoted, accepted, declined, expired, cancelled |
| `DiscountType` | Enum | hours_volume, days_volume, recurring, first_time |
| `PaymentIntentStatus` | Enum | pending, processing, completed, failed, cancelled, expired |
| `TransactionStatus` | Enum | pending, captured, failed, refunded, partially_refunded |
| `ServiceStatus` | Enum | draft, pending_approval, approved, published, rejected, unpublished, archived |
| `VerificationStatus` | Enum | pending, verified, rejected |
| `ServiceLocationType` | Enum | at_customer, at_provider, remote, flexible |
| `ProviderType` | Enum | individual, organization |
| `OrganizationType` | Enum | salon, workshop, restaurant, clinic, agency, other |
| `MemberRole` | Enum | owner, manager, staff |
| `AvailabilityRuleType` | Enum | weekly_recurring, date_range, one_time |
| `ExceptionType` | Enum | blocked, special |
| `SlotSourceType` | Enum | rule, exception |
| `OwnerType` | Enum | individual, organization, staff |
| `TimeWindow` | Custom | start_time (HH:mm) + end_time (HH:mm) |
| `BufferTime` | Number | Minutes between appointments |
| `BookingSnapshot` | Custom | Immutable JSON of service, slot, pricing at booking time |
| `RecurrenceFrequency` | Enum | weekly, biweekly, monthly |
| `RecurrenceStatus` | Enum | active, paused, cancelled, completed |
| `BillingFrequency` | Enum | monthly, quarterly, annual |
| `SubscriptionStatus` | Enum | pending, active, paused, cancelled, expired |
| `BillingStatus` | Enum | pending, paid, failed, refunded |

#### Domain Events

| Event | Trigger | Handlers |
|-------|---------|----------|
| `UserRegistered` | New user created | Send welcome email, create wallet |
| `ProviderVerified` | Admin approves provider | Update profile, send notification |
| `BookingCreated` | Customer creates booking | Notify provider, create snapshot |
| `BookingPendingPayment` | Provider accepts | Create payment intent, start payment timer |
| `BookingConfirmed` | Payment completed | Update slot capacity, notify both parties |
| `BookingStarted` | Provider marks started | Update status, notify customer |
| `BookingCompleted` | Provider marks done | Start confirmation timer |
| `BookingCancelled` | Either party cancels | Process refund, release slot capacity |
| `BookingExpired` | Payment timeout | Release slot, notify both parties |
| `PaymentIntentCreated` | Booking accepted | Start payment timer |
| `PaymentProcessed` | Payment succeeds | Confirm booking, send receipt |
| `PaymentFailed` | Payment fails | Notify customer, allow retry |
| `PaymentExpired` | Payment timeout | Expire booking |
| `PayoutRequested` | Provider requests payout | Process payout |
| `PayoutCompleted` | Payout succeeds | Update wallet, notify provider |
| `QuoteRequested` | Customer requests custom quote | Notify provider |
| `QuoteResponded` | Provider sends quote | Notify customer |
| `QuoteAccepted` | Customer accepts quote | Create booking |
| `QuoteDeclined` | Customer declines quote | Notify provider |
| `QuoteExpired` | Quote passes 48h without response | Notify both parties |
| `DiscountApplied` | Volume discount threshold met | Adjust booking price |
| `TaskPosted` | Customer posts task | Notify matching providers |
| `BidSubmitted` | Provider bids | Notify customer |
| `BidAccepted` | Customer accepts bid | Create booking, reject others |
| `ReviewSubmitted` | User submits review | Update ratings, notify reviewee |
| `MessageSent` | User sends message | Push notification |
| `OrganizationCreated` | User creates organization | Set up profile |
| `OrganizationVerified` | Admin verifies organization | Update status, notify owner |
| `StaffMemberAdded` | Owner adds staff | Grant access, notify member |
| `StaffMemberRemoved` | Owner removes staff | Revoke access, notify member |
| `SlotReserved` | Booking confirmed | Increment booked_spots, decrement available_spots |
| `SlotReleased` | Booking cancelled/expired | Decrement booked_spots, increment available_spots |
| `SlotsRegenerated` | Availability config changed | Delete and regenerate slots for affected period |
| `ServiceSubmitted` | Provider submits service for approval | Queue for admin review |
| `ServiceApproved` | Admin approves service | Allow publishing |
| `ServiceRejected` | Admin rejects service | Notify provider with reason |
| `ServicePublished` | Provider publishes approved service | Make visible to customers |
| `RecurrenceCreated` | Customer creates recurring booking | Generate first N bookings |
| `RecurrenceCancelled` | Customer cancels recurring series | Cancel future pending bookings |
| `RecurrenceOccurrenceSkipped` | Customer skips one occurrence | Mark as skipped, keep series active |
| `SubscriptionCreated` | Customer subscribes to a plan | Process first payment |
| `SubscriptionRenewed` | Billing cycle auto-renews | Create billing record, process payment |
| `SubscriptionPaused` | Customer pauses subscription | Stop billing, keep record |
| `SubscriptionResumed` | Customer resumes subscription | Resume billing from next cycle |
| `SubscriptionCancelled` | Customer cancels subscription | Mark for end-of-period cancellation |
| `SubscriptionExpired` | Repeated payment failures | Deactivate subscription |
| `SubscriptionBillingFailed` | Renewal payment fails | Retry, notify customer |

### 3.0.4 Application Layer (Use Cases)

#### User Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `RegisterUser` | email/phone, password, name | User | UserRegistered |
| `LoginUser` | credentials | Session | - |
| `UpdateProfile` | userId, profileData | User | - |
| `UpgradeToProvider` | userId, bio, skills, serviceAreas | Profile | - |
| `SubmitVerification` | userId, documents | Profile | - |
| `ApproveVerification` | userId, adminId | Profile | ProviderVerified |
| `RejectVerification` | userId, adminId, reason | Profile | - |

#### Organization Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `CreateOrganization` | userId, organizationData | Organization | OrganizationCreated |
| `UpdateOrganization` | organizationId, organizationData | Organization | - |
| `SetOrganizationAvailability` | organizationId, availabilityRules | AvailabilityRule[] | - |
| `AddStaffMember` | organizationId, userId, role | OrganizationMember | StaffMemberAdded |
| `RemoveStaffMember` | organizationId, memberId | OrganizationMember | StaffMemberRemoved |
| `AssignServiceToStaff` | serviceId, memberId | Service | - |
| `SubmitOrganizationVerification` | organizationId, documents | VerificationRequest | - |
| `ApproveOrganizationVerification` | organizationId, adminId | Organization | OrganizationVerified |

#### Catalog Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `CreateService` | providerId, categoryId, pricingMode | Service (draft) | - |
| `SubmitServiceForApproval` | serviceId | Service | ServiceSubmitted |
| `ApproveService` | serviceId, adminId | Service | ServiceApproved |
| `RejectService` | serviceId, adminId, reason | Service | ServiceRejected |
| `PublishService` | serviceId | Service | ServicePublished |
| `UnpublishService` | serviceId | Service | - |
| `ArchiveService` | serviceId | Service | - |
| `CreateServicePackage` | serviceId, name, price, duration | ServicePackage | - |
| `UpdateServicePackage` | packageId, packageData | ServicePackage | - |
| `DeactivateServicePackage` | packageId | ServicePackage | - |

#### Scheduling Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `CreateAvailabilityRule` | ownerType, ownerId, ruleType, daysOfWeek, timeWindows | AvailabilityRule | SlotsRegenerated |
| `UpdateAvailabilityRule` | ruleId, ruleData | AvailabilityRule | SlotsRegenerated |
| `DeleteAvailabilityRule` | ruleId | void | SlotsRegenerated |
| `CreateAvailabilityException` | ownerType, ownerId, date, exceptionType, timeWindows? | AvailabilityException | SlotsRegenerated |
| `DeleteAvailabilityException` | exceptionId | void | SlotsRegenerated |
| `UpdateSchedulingConfig` | ownerType, ownerId, configData | SchedulingConfig | - |
| `GenerateSlots` | ownerType, ownerId, serviceId, dateRange | Slot[] | SlotsRegenerated |
| `GetAvailableSlots` | serviceId, date, staffId? | Slot[] | - |
| `ReserveSlotCapacity` | slotId, spots | Slot | SlotReserved |
| `ReleaseSlotCapacity` | slotId, spots | Slot | SlotReleased |

#### Pricing Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `RequestCustomQuote` | customerId, providerId, details | QuoteRequest | QuoteRequested |
| `RespondToQuote` | quoteRequestId, providerId, priceBreakdown | QuoteResponse | QuoteResponded |
| `AcceptQuote` | quoteResponseId, customerId | Booking | QuoteAccepted, BookingCreated |
| `DeclineQuote` | quoteResponseId, customerId | QuoteResponse | QuoteDeclined |
| `ExpireQuote` | quoteResponseId | QuoteResponse | QuoteExpired |
| `CreateDiscountRule` | providerId, discountType, threshold, percentage | DiscountRule | - |
| `UpdateDiscountRule` | ruleId, ruleData | DiscountRule | - |
| `CalculatePrice` | serviceId, packageId, hours, days | PriceCalculation | DiscountApplied (if applicable) |

#### Booking Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `BookPackage` | customerId, packageId, date, slotTime, location | Booking | BookingCreated, SlotBooked |
| `BookHourly` | customerId, serviceId, hours, date, slotTime, location | Booking | BookingCreated, SlotBooked |
| `BookFromQuote` | quoteResponseId, customerId, date, slotTime | Booking | BookingCreated, SlotBooked |
| `BookFromBid` | bidId, customerId | Booking | BidAccepted, BookingCreated |
| `AcceptBooking` | bookingId, providerId | Booking | BookingPendingPayment |
| `DeclineBooking` | bookingId, providerId, reason | Booking | BookingCancelled |
| `ConfirmBooking` | bookingId | Booking | BookingConfirmed, SlotReserved |
| `ExpireBooking` | bookingId | Booking | BookingExpired |
| `StartBooking` | bookingId, providerId | Booking | BookingStarted |
| `CompleteBooking` | bookingId, providerId | Booking | BookingCompleted |
| `ConfirmCompletion` | bookingId, customerId | Booking | PaymentReleased |
| `DisputeBooking` | bookingId, customerId, reason | Dispute | BookingDisputed |
| `CancelBooking` | bookingId, userId, reason | Booking | BookingCancelled, SlotReleased |
| `CreateRecurringBooking` | customerId, serviceId, packageId?, frequency, dayOfWeek, time, location | BookingRecurrence | RecurrenceCreated, BookingCreated (×N) |
| `SkipRecurrenceOccurrence` | recurrenceId, bookingId | Booking | RecurrenceOccurrenceSkipped |
| `CancelRecurrence` | recurrenceId, customerId | BookingRecurrence | RecurrenceCancelled |
| `PauseRecurrence` | recurrenceId, customerId | BookingRecurrence | - |
| `ResumeRecurrence` | recurrenceId, customerId | BookingRecurrence | - |
| `GenerateNextOccurrence` | recurrenceId | Booking | BookingCreated |
| `CreateSubscriptionPlan` | serviceId, planData | SubscriptionPlan | - |
| `UpdateSubscriptionPlan` | planId, planData | SubscriptionPlan | - |
| `DeactivateSubscriptionPlan` | planId | SubscriptionPlan | - |
| `Subscribe` | customerId, planId | ServiceSubscription | SubscriptionCreated |
| `PauseSubscription` | subscriptionId, customerId | ServiceSubscription | SubscriptionPaused |
| `ResumeSubscription` | subscriptionId, customerId | ServiceSubscription | SubscriptionResumed |
| `CancelSubscription` | subscriptionId, customerId, reason | ServiceSubscription | SubscriptionCancelled |
| `RenewSubscription` | subscriptionId | SubscriptionBilling | SubscriptionRenewed |
| `RetrySubscriptionPayment` | billingId | SubscriptionBilling | SubscriptionBillingFailed or SubscriptionRenewed |
| `ExpireSubscription` | subscriptionId | ServiceSubscription | SubscriptionExpired |
| `PostTask` | customerId, taskData | TaskPost | TaskPosted |
| `SubmitBid` | taskId, providerId, bidData | Bid | BidSubmitted |
| `AcceptBid` | bidId, customerId | Booking | BidAccepted, BookingCreated |
| `WithdrawBid` | bidId, providerId | Bid | - |

#### Payment Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `CreatePaymentIntent` | bookingId, payerId, amount, method | PaymentIntent | PaymentIntentCreated |
| `ProcessPayment` | paymentIntentId | PaymentTransaction | PaymentProcessed |
| `RetryPayment` | paymentIntentId, method? | PaymentTransaction | - |
| `ExpirePaymentIntent` | paymentIntentId | PaymentIntent | PaymentExpired |
| `RefundPayment` | paymentIntentId, amount, reason | PaymentTransaction | PaymentRefunded |
| `AddTip` | bookingId, amount | PaymentTransaction | TipAdded |
| `RequestPayout` | providerId, amount, method | Payout | PayoutRequested |
| `ProcessPayout` | payoutId | Payout | PayoutCompleted |

#### Communication Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `SendMessage` | conversationId, senderId, content | Message | MessageSent |
| `GetConversation` | conversationId, userId | Conversation | - |
| `MarkAsRead` | conversationId, userId | - | - |
| `SendNotification` | userId, notification | Notification | - |

#### Review Context

| Use Case | Input | Output | Events |
|----------|-------|--------|--------|
| `SubmitReview` | bookingId, reviewerId, reviewData | Review | ReviewSubmitted |
| `RespondToReview` | reviewId, providerId, response | Review | - |
| `ReportReview` | reviewId, reporterId, reason | Report | - |

### 3.0.5 Infrastructure Ports (Interfaces)

#### Repository Ports

```typescript
// Domain defines these interfaces (ports)
interface UserRepository {
  findById(id: UserId): Promise<User | null>
  findByEmail(email: Email): Promise<User | null>
  findByPhone(phone: Phone): Promise<User | null>
  save(user: User): Promise<void>
  delete(id: UserId): Promise<void>
}

interface ServicePackageRepository {
  findById(id: PackageId): Promise<ServicePackage | null>
  findByService(serviceId: ServiceId): Promise<ServicePackage[]>
  findByProvider(providerId: UserId): Promise<ServicePackage[]>
  save(pkg: ServicePackage): Promise<void>
}

interface QuoteRequestRepository {
  findById(id: QuoteRequestId): Promise<QuoteRequest | null>
  findByCustomer(customerId: UserId, pagination: Pagination): Promise<QuoteRequest[]>
  findByProvider(providerId: UserId, pagination: Pagination): Promise<QuoteRequest[]>
  findExpired(): Promise<QuoteRequest[]>
  save(quote: QuoteRequest): Promise<void>
}

interface DiscountRuleRepository {
  findByProvider(providerId: UserId): Promise<DiscountRule[]>
  findByService(serviceId: ServiceId): Promise<DiscountRule[]>
  findApplicable(providerId: UserId, serviceId: ServiceId, params: DiscountParams): Promise<DiscountRule[]>
  save(rule: DiscountRule): Promise<void>
}

interface BookingRepository {
  findById(id: BookingId): Promise<Booking | null>
  findByCustomer(customerId: UserId, pagination: Pagination): Promise<Booking[]>
  findByProvider(providerId: UserId, pagination: Pagination): Promise<Booking[]>
  save(booking: Booking): Promise<void>
}

interface PaymentIntentRepository {
  findById(id: PaymentIntentId): Promise<PaymentIntent | null>
  findByBooking(bookingId: BookingId): Promise<PaymentIntent | null>
  findExpired(): Promise<PaymentIntent[]>
  save(intent: PaymentIntent): Promise<void>
}

interface PaymentTransactionRepository {
  findById(id: TransactionId): Promise<PaymentTransaction | null>
  findByIntent(intentId: PaymentIntentId): Promise<PaymentTransaction[]>
  save(transaction: PaymentTransaction): Promise<void>
}

interface BookingRecurrenceRepository {
  findById(id: RecurrenceId): Promise<BookingRecurrence | null>
  findByCustomer(customerId: UserId): Promise<BookingRecurrence[]>
  findByProvider(providerId: UserId): Promise<BookingRecurrence[]>
  findActive(): Promise<BookingRecurrence[]>
  save(recurrence: BookingRecurrence): Promise<void>
}

interface SubscriptionPlanRepository {
  findById(id: PlanId): Promise<SubscriptionPlan | null>
  findByService(serviceId: ServiceId): Promise<SubscriptionPlan[]>
  findByProvider(providerId: UserId): Promise<SubscriptionPlan[]>
  save(plan: SubscriptionPlan): Promise<void>
}

interface ServiceSubscriptionRepository {
  findById(id: SubscriptionId): Promise<ServiceSubscription | null>
  findByCustomer(customerId: UserId): Promise<ServiceSubscription[]>
  findByProvider(providerId: UserId): Promise<ServiceSubscription[]>
  findDueForRenewal(date: Date): Promise<ServiceSubscription[]>
  findExpiredPayments(maxRetries: number): Promise<ServiceSubscription[]>
  save(subscription: ServiceSubscription): Promise<void>
}

interface SubscriptionBillingRepository {
  findById(id: BillingId): Promise<SubscriptionBilling | null>
  findBySubscription(subscriptionId: SubscriptionId): Promise<SubscriptionBilling[]>
  findPendingRetries(): Promise<SubscriptionBilling[]>
  save(billing: SubscriptionBilling): Promise<void>
}

interface OrganizationRepository {
  findById(id: OrganizationId): Promise<Organization | null>
  findByOwner(ownerId: UserId): Promise<Organization[]>
  save(organization: Organization): Promise<void>
}

interface OrganizationMemberRepository {
  findByOrganization(organizationId: OrganizationId): Promise<OrganizationMember[]>
  findByUser(userId: UserId): Promise<OrganizationMember[]>
  save(member: OrganizationMember): Promise<void>
  delete(memberId: MemberId): Promise<void>
}

interface AvailabilityRuleRepository {
  findById(id: RuleId): Promise<AvailabilityRule | null>
  findByOwner(ownerType: OwnerType, ownerId: string): Promise<AvailabilityRule[]>
  findRulesForDate(ownerType: OwnerType, ownerId: string, date: Date): Promise<AvailabilityRule[]>
  save(rule: AvailabilityRule): Promise<void>
  delete(id: RuleId): Promise<void>
}

interface AvailabilityExceptionRepository {
  findById(id: ExceptionId): Promise<AvailabilityException | null>
  findByOwner(ownerType: OwnerType, ownerId: string): Promise<AvailabilityException[]>
  findForDate(ownerType: OwnerType, ownerId: string, date: Date): Promise<AvailabilityException | null>
  save(exception: AvailabilityException): Promise<void>
  delete(id: ExceptionId): Promise<void>
}

interface SlotRepository {
  findById(id: SlotId): Promise<Slot | null>
  findAvailable(serviceId: ServiceId, date: Date): Promise<Slot[]>
  findByOwner(ownerType: OwnerType, ownerId: string, dateRange: DateRange): Promise<Slot[]>
  save(slot: Slot): Promise<void>
  saveBatch(slots: Slot[]): Promise<void>
  deleteByOwnerAndDateRange(ownerType: OwnerType, ownerId: string, dateRange: DateRange): Promise<void>
  reserveSpots(slotId: SlotId, spots: number): Promise<Slot>
  releaseSpots(slotId: SlotId, spots: number): Promise<Slot>
}

interface SchedulingConfigRepository {
  findByOwner(ownerType: OwnerType, ownerId: string): Promise<SchedulingConfig | null>
  save(config: SchedulingConfig): Promise<void>
}
```

#### External Service Ports

```typescript
interface AuthService {
  register(data: RegisterData): Promise<User>
  login(credentials: Credentials): Promise<Session>
  logout(sessionId: string): Promise<void>
  verifyOTP(phone: Phone, otp: string): Promise<boolean>
}

interface PaymentGateway {
  authorize(amount: Money, method: PaymentMethod): Promise<PaymentAuth>
  capture(authId: string): Promise<PaymentResult>
  refund(paymentId: string, amount: Money): Promise<RefundResult>
}

interface PayoutService {
  sendMPesa(phone: Phone, amount: Money): Promise<PayoutResult>
  sendEMola(phone: Phone, amount: Money): Promise<PayoutResult>
  sendBank(account: BankAccount, amount: Money): Promise<PayoutResult>
}

interface NotificationService {
  sendPush(userId: UserId, notification: PushNotification): Promise<void>
  sendEmail(email: Email, template: EmailTemplate): Promise<void>
  sendSMS(phone: Phone, message: string): Promise<void>
}

interface StorageService {
  upload(file: File, path: string): Promise<string>
  delete(path: string): Promise<void>
  getUrl(path: string): Promise<string>
}

interface LocationService {
  geocode(address: string): Promise<Coordinates>
  reverseGeocode(coords: Coordinates): Promise<Address>
  calculateDistance(from: Coordinates, to: Coordinates): Promise<number>
}
```

### 3.0.6 Infrastructure Adapters

| Port | Adapter | Technology |
|------|---------|------------|
| AuthService | BetterAuthAdapter | Better Auth |
| UserRepository | PostgresUserRepository | PostgreSQL + Drizzle/Prisma |
| BookingRepository | PostgresBookingRepository | PostgreSQL |
| SlotRepository | PostgresSlotRepository | PostgreSQL |
| AvailabilityRuleRepository | PostgresAvailabilityRuleRepository | PostgreSQL |
| PaymentIntentRepository | PostgresPaymentIntentRepository | PostgreSQL |
| BookingRecurrenceRepository | PostgresBookingRecurrenceRepository | PostgreSQL |
| SubscriptionPlanRepository | PostgresSubscriptionPlanRepository | PostgreSQL |
| ServiceSubscriptionRepository | PostgresServiceSubscriptionRepository | PostgreSQL |
| SubscriptionBillingRepository | PostgresSubscriptionBillingRepository | PostgreSQL |
| PaymentGateway | MPesaAdapter | M-Pesa API |
| PaymentGateway | EMolaAdapter | e-Mola API |
| PaymentGateway | StripeAdapter | Stripe API |
| PayoutService | MPesaPayoutAdapter | M-Pesa B2C API |
| PayoutService | EMolaPayoutAdapter | e-Mola API |
| NotificationService | FirebaseAdapter | Firebase Cloud Messaging |
| NotificationService | TwilioAdapter | Twilio SMS |
| NotificationService | SendGridAdapter | SendGrid Email |
| StorageService | S3Adapter | AWS S3 |
| LocationService | GoogleMapsAdapter | Google Maps API |

### 3.0.7 Error Hierarchy (onion-lasagna)

| Error Type | HTTP Status | Example |
|------------|-------------|---------|
| `NotFoundError` | 404 | User not found, Booking not found |
| `ConflictError` | 409 | Email already registered, Bid already exists |
| `ValidationError` | 422 | Invalid email format, Price out of range |
| `UnauthorizedError` | 401 | Invalid credentials, Session expired |
| `ForbiddenError` | 403 | Not your booking, Provider not verified |
| `DomainError` | 400 | Cannot cancel completed booking |
| `InfrastructureError` | 500 | Database connection failed |

### 3.0.8 Project Structure

```
ntizo/
├── apps/
│   ├── api/                    # Main API (Hono/Elysia)
│   │   ├── src/
│   │   │   ├── routes/         # HTTP route handlers
│   │   │   ├── middleware/     # Auth, logging, error handling
│   │   │   └── index.ts
│   │   └── package.json
│   ├── admin/                  # Admin portal (React/Next)
│   ├── mobile/                 # Mobile app (React Native)
│   └── web/                    # Customer/Provider web app
│
├── packages/
│   ├── domain/                 # Domain layer (framework-agnostic)
│   │   ├── src/
│   │   │   ├── user/
│   │   │   │   ├── entities/
│   │   │   │   ├── value-objects/
│   │   │   │   ├── events/
│   │   │   │   ├── repositories/   # Port interfaces
│   │   │   │   └── index.ts
│   │   │   ├── booking/
│   │   │   ├── payment/
│   │   │   ├── catalog/
│   │   │   ├── pricing/
│   │   │   ├── scheduling/
│   │   │   ├── communication/
│   │   │   └── review/
│   │   └── package.json
│   │
│   ├── application/            # Application layer (use cases)
│   │   ├── src/
│   │   │   ├── user/
│   │   │   │   ├── register-user.ts
│   │   │   │   ├── upgrade-to-provider.ts
│   │   │   │   ├── create-organization.ts
│   │   │   │   ├── add-staff-member.ts
│   │   │   │   └── index.ts
│   │   │   ├── catalog/
│   │   │   │   ├── create-service-package.ts
│   │   │   │   └── index.ts
│   │   │   ├── pricing/
│   │   │   │   ├── request-custom-quote.ts
│   │   │   │   ├── respond-to-quote.ts
│   │   │   │   ├── calculate-price.ts
│   │   │   │   └── index.ts
│   │   │   ├── scheduling/
│   │   │   │   ├── create-availability-rule.ts
│   │   │   │   ├── create-availability-exception.ts
│   │   │   │   ├── update-scheduling-config.ts
│   │   │   │   ├── generate-slots.ts
│   │   │   │   ├── get-available-slots.ts
│   │   │   │   ├── reserve-slot-capacity.ts
│   │   │   │   └── index.ts
│   │   │   ├── booking/
│   │   │   │   ├── book-package.ts
│   │   │   │   ├── book-hourly.ts
│   │   │   │   ├── book-from-quote.ts
│   │   │   │   ├── create-recurring-booking.ts
│   │   │   │   ├── subscribe.ts
│   │   │   │   ├── renew-subscription.ts
│   │   │   │   ├── cancel-subscription.ts
│   │   │   │   └── index.ts
│   │   │   ├── payment/
│   │   │   └── ...
│   │   └── package.json
│   │
│   ├── infrastructure/         # Infrastructure layer (adapters)
│   │   ├── src/
│   │   │   ├── database/
│   │   │   │   ├── schema/
│   │   │   │   ├── repositories/
│   │   │   │   └── migrations/
│   │   │   ├── auth/
│   │   │   │   └── better-auth-adapter.ts
│   │   │   ├── payment/
│   │   │   │   ├── mpesa-adapter.ts
│   │   │   │   ├── emola-adapter.ts
│   │   │   │   └── stripe-adapter.ts
│   │   │   ├── notification/
│   │   │   ├── storage/
│   │   │   └── location/
│   │   └── package.json
│   │
│   ├── contracts/              # Shared API contracts (onion-lasagna)
│   │   ├── src/
│   │   │   ├── user.contract.ts
│   │   │   ├── booking.contract.ts
│   │   │   └── ...
│   │   └── package.json
│   │
│   └── shared/                 # Shared utilities
│       ├── src/
│       │   ├── value-objects/
│       │   ├── errors/
│       │   └── utils/
│       └── package.json
│
├── turbo.json                  # Turbo monorepo config
├── package.json
└── bun.lockb
```

### 3.0.9 Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Runtime** | Bun | Fast, TypeScript-native |
| **Monorepo** | Turborepo | Build optimization |
| **API Framework** | Hono | Lightweight, edge-compatible |
| **Validation** | Zod | Runtime type checking |
| **Database** | Neon PostgreSQL | Serverless, auto-scaling |
| **ORM** | Drizzle | Type-safe, performant |
| **Auth** | Better Auth | Full-featured, TypeScript |
| **Architecture** | onion-lasagna | DDD building blocks |
| **Mobile** | React Native | Cross-platform |
| **Web** | Next.js | SSR, React |
| **State** | TanStack Query | Server state management |
| **Deployment** | Vercel / Cloudflare | Serverless, edge |
| **Cache** | Upstash Redis | Serverless Redis |
| **Queue** | Inngest / QStash | Serverless background jobs |
| **Storage** | Cloudflare R2 / S3 | Object storage |
| **WebSockets** | Ably / Pusher | Real-time messaging |

## 3.1 External Interfaces

### 3.1.1 User Interfaces

| ID | Interface |
|----|-----------|
| UI-001 | Customer Mobile App (iOS/Android) |
| UI-002 | Provider Mobile App (iOS/Android) |
| UI-003 | Customer Web App |
| UI-004 | Provider Web App |
| UI-005 | Admin Portal |

### 3.1.2 Software Interfaces

| ID | Interface | Purpose |
|----|-----------|---------|
| SW-001 | Better Auth | Authentication |
| SW-002 | M-Pesa API | Mobile money |
| SW-003 | e-Mola API | Mobile money |
| SW-004 | Stripe API | Card payments |
| SW-005 | Google Maps API | Location |
| SW-006 | Firebase CM | Push notifications |
| SW-007 | Twilio | SMS |
| SW-008 | SendGrid | Email |
| SW-009 | AWS S3 | File storage |

---

## 3.2 Functional Requirements

### 3.2.1 Authentication (Better Auth)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-001 | The system shall implement Better Auth for authentication | High |
| FR-AUTH-002 | The system shall allow email registration | High |
| FR-AUTH-003 | The system shall allow phone registration | High |
| FR-AUTH-004 | The system shall support social login (Google, Facebook, Apple) | Medium |
| FR-AUTH-005 | The system shall send OTP for phone verification | High |
| FR-AUTH-006 | The system shall send email verification | High |
| FR-AUTH-007 | The system shall require password min 8 chars with letter and number | High |
| FR-AUTH-008 | The system shall support passwordless OTP login | Medium |
| FR-AUTH-009 | The system shall lock account after 5 failed attempts | High |
| FR-AUTH-010 | The system shall support password reset via email/SMS | High |
| FR-AUTH-011 | The system shall manage sessions via Better Auth | High |
| FR-AUTH-012 | The system shall expire sessions after 7 days inactivity | High |
| FR-AUTH-013 | The system shall invalidate sessions on logout | High |
| FR-AUTH-014 | The system shall implement RBAC (customer, provider, admin) | High |

### 3.2.2 User Profile

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PROF-001 | The system shall allow profile creation with name and photo | High |
| FR-PROF-002 | The system shall allow multiple verified phones | Medium |
| FR-PROF-003 | The system shall allow multiple verified emails | Medium |
| FR-PROF-004 | The system shall allow setting primary contact | Medium |
| FR-PROF-005 | The system shall allow profile updates | High |
| FR-PROF-006 | The system shall resize images to max 1MB | High |
| FR-PROF-007 | The system shall support account deletion (30-day retention) | High |

### 3.2.3 Provider Profile (via Profile upgrade)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PROV-001 | The system shall allow provider registration | High |
| FR-PROV-002 | The system shall require bio (min 50 chars) | High |
| FR-PROV-003 | The system shall allow portfolio images (max 10) | High |
| FR-PROV-004 | The system shall allow service category selection | High |
| FR-PROV-005 | The system shall allow hourly or fixed pricing | High |
| FR-PROV-006 | The system shall allow service area definition | High |
| FR-PROV-007 | The system shall allow availability schedule | High |
| FR-PROV-008 | The system shall allow date blocking | Medium |
| FR-PROV-009 | The system shall allow instant booking toggle | Medium |
| FR-PROV-010 | The system shall display average rating | High |
| FR-PROV-011 | The system shall display completed task count | High |
| FR-PROV-012 | The system shall display verification badges | High |

### 3.2.4 Provider Verification

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-VER-001 | The system shall require government ID upload | High |
| FR-VER-002 | The system shall accept BI, passport, license | High |
| FR-VER-003 | The system shall accept front and back images | High |
| FR-VER-004 | The system shall encrypt stored documents | High |
| FR-VER-005 | The system shall queue for admin review | High |
| FR-VER-006 | The system shall notify verification status | High |
| FR-VER-007 | The system shall allow admin approve/reject | High |
| FR-VER-008 | The system shall allow re-submission if rejected | High |
| FR-VER-009 | The system shall display "Verified" badge | High |

### 3.2.5 Service Catalog

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CAT-001 | The system shall support hierarchical categories | High |
| FR-CAT-002 | The system shall allow admin CRUD on categories | High |
| FR-CAT-003 | The system shall support category icons and order | Medium |
| FR-CAT-004 | The system shall allow enable/disable categories | High |

**Service Categories:**

| Category | Subcategories |
|----------|---------------|
| Home Cleaning | Regular, Deep, Move-in/out |
| Repairs | Plumbing, Electrical, General, Painting |
| Assembly | Furniture, TV mounting, Appliances |
| Moving | Home, Office, Delivery |
| Gardening | Lawn, Garden, Trees |
| Personal | Assistant, Errands, Shopping |
| Events | Planning, Catering, Photography |
| Beauty | Hair, Makeup, Massage |
| Tutoring | Academic, Language, Music |
| Technology | Computer, Tech support, Web |
| Professional | Accounting, Legal, Translation |
| Automotive | Washing, Repairs, Driver |

### 3.2.6 Search and Discovery

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SRCH-001 | The system shall allow keyword search | High |
| FR-SRCH-002 | The system shall allow category browsing | High |
| FR-SRCH-003 | The system shall allow location filter | High |
| FR-SRCH-004 | The system shall allow distance filter | High |
| FR-SRCH-005 | The system shall allow price range filter | Medium |
| FR-SRCH-006 | The system shall allow rating filter | Medium |
| FR-SRCH-007 | The system shall allow verification filter | Medium |
| FR-SRCH-008 | The system shall allow availability filter | Medium |
| FR-SRCH-009 | The system shall support sorting | Medium |
| FR-SRCH-010 | The system shall paginate (20/page) | High |

### 3.2.7 Direct Booking

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-BOOK-001 | The system shall allow direct booking from profile | High |
| FR-BOOK-002 | The system shall display availability calendar | High |
| FR-BOOK-003 | The system shall allow date/time selection | High |
| FR-BOOK-004 | The system shall allow location entry | High |
| FR-BOOK-005 | The system shall allow GPS location | High |
| FR-BOOK-006 | The system shall allow saving addresses | Medium |
| FR-BOOK-007 | The system shall allow task description (1000 chars) | High |
| FR-BOOK-008 | The system shall allow image attachments (max 5) | Medium |
| FR-BOOK-009 | The system shall calculate total price | High |
| FR-BOOK-010 | The system shall display price breakdown | High |
| FR-BOOK-011 | The system shall require payment authorization | High |
| FR-BOOK-012 | The system shall send to provider for confirmation | High |
| FR-BOOK-013 | The system shall allow accept/decline (24h) | High |
| FR-BOOK-014 | The system shall auto-cancel on timeout | High |
| FR-BOOK-015 | The system shall notify booking status | High |
| FR-BOOK-016 | The system shall update slot capacity on confirmation | High |
| FR-BOOK-017 | The system shall capture a booking snapshot at creation time | High |
| FR-BOOK-018 | The system shall transition to pending_payment after provider acceptance | High |
| FR-BOOK-019 | The system shall validate slot availability before confirming | High |
| FR-BOOK-020 | The system shall allow creating recurring bookings (weekly, biweekly, monthly) for Path A and B | High |
| FR-BOOK-021 | The system shall auto-generate future booking occurrences for recurring series | High |
| FR-BOOK-022 | The system shall allow skipping individual occurrences without cancelling the series | High |
| FR-BOOK-023 | The system shall apply recurring discount automatically to series bookings | High |

### 3.2.8 Task Posting and Bidding

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-TASK-001 | The system shall allow task posting | High |
| FR-TASK-002 | The system shall require title (100 chars) | High |
| FR-TASK-003 | The system shall require description (20-2000 chars) | High |
| FR-TASK-004 | The system shall require category | High |
| FR-TASK-005 | The system shall require location | High |
| FR-TASK-006 | The system shall allow optional date/time | High |
| FR-TASK-007 | The system shall allow optional budget range | Medium |
| FR-TASK-008 | The system shall allow images (max 5) | Medium |
| FR-TASK-009 | The system shall publish to matching providers | High |
| FR-TASK-010 | The system shall allow providers to browse tasks | High |
| FR-TASK-011 | The system shall allow bid submission | High |
| FR-TASK-012 | The system shall require bid price | High |
| FR-TASK-013 | The system shall require bid message (20 chars) | High |
| FR-TASK-014 | The system shall allow alternative date in bid | Medium |
| FR-TASK-015 | The system shall notify customer of bids | High |
| FR-TASK-016 | The system shall display all bids | High |
| FR-TASK-017 | The system shall allow accepting one bid | High |
| FR-TASK-018 | The system shall reject others on acceptance | High |
| FR-TASK-019 | The system shall convert accepted bid to booking | High |
| FR-TASK-020 | The system shall allow closing without accepting | Medium |
| FR-TASK-021 | The system shall auto-expire after 7 days | Medium |
| FR-TASK-022 | The system shall allow bid withdrawal | Medium |

### 3.2.9 Booking Lifecycle

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-LIFE-001 | The system shall track status: pending, pending_payment, confirmed, in_progress, completed, cancelled, disputed, expired | High |
| FR-LIFE-002 | The system shall allow marking "started" | High |
| FR-LIFE-003 | The system shall record start timestamp | High |
| FR-LIFE-004 | The system shall allow marking "completed" | High |
| FR-LIFE-005 | The system shall record completion timestamp | High |
| FR-LIFE-006 | The system shall require customer confirmation (24h) | High |
| FR-LIFE-007 | The system shall auto-confirm after 24h | High |
| FR-LIFE-008 | The system shall release payment on confirmation | High |
| FR-LIFE-009 | The system shall allow dispute within 24h | High |
| FR-LIFE-010 | The system shall allow cancellation before start | High |
| FR-LIFE-011 | The system shall apply cancellation policy | High |
| FR-LIFE-012 | The system shall allow provider cancellation | High |
| FR-LIFE-013 | The system shall track cancellation rate | Medium |
| FR-LIFE-014 | The system shall send reminders (24h, 1h) | Medium |
| FR-LIFE-015 | The system shall transition booking to pending_payment after provider acceptance | High |
| FR-LIFE-016 | The system shall expire pending_payment bookings after configurable timeout (default 30 min) | High |
| FR-LIFE-017 | The system shall capture a booking snapshot at booking creation time | High |
| FR-LIFE-018 | The system shall update slot capacity atomically on confirmation | High |
| FR-LIFE-019 | The system shall release slot capacity on cancellation or expiry | High |

**Cancellation Policy:**

| Time Before | Refund | Provider Penalty |
|-------------|--------|------------------|
| 24+ hours | 100% | None |
| 12-24 hours | 75% | None |
| 2-12 hours | 50% | None |
| < 2 hours | 0% | None |
| Provider cancels | 100% | Rate impact |

### 3.2.10 Subscriptions

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SUB-001 | The system shall allow providers to create subscription plans (name, price, frequency, includes) | High |
| FR-SUB-002 | The system shall allow providers to manage plans (activate, deactivate, update) | High |
| FR-SUB-003 | The system shall allow customers to browse and subscribe to plans | High |
| FR-SUB-004 | The system shall process initial payment on subscription creation | High |
| FR-SUB-005 | The system shall auto-renew at each billing cycle (monthly, quarterly, annual) | High |
| FR-SUB-006 | The system shall allow customers to pause subscriptions | High |
| FR-SUB-007 | The system shall allow customers to resume paused subscriptions | High |
| FR-SUB-008 | The system shall allow cancellation (effective end of current period) | High |
| FR-SUB-009 | The system shall send renewal reminders before billing date | Medium |
| FR-SUB-010 | The system shall retry failed renewal payments (up to 3 attempts) | High |
| FR-SUB-011 | The system shall expire subscriptions after repeated payment failures | High |
| FR-SUB-012 | The system shall allow providers to view subscriber analytics | High |
| FR-SUB-013 | The system shall lock subscriber price when plan pricing changes | Medium |
| FR-SUB-014 | The system shall apply platform commission to each billing cycle | High |
| FR-SUB-015 | The system shall maintain billing history per subscription | High |

**Subscription Lifecycle:**

```
         ┌─────────┐
         │ PENDING │ (awaiting first payment)
         └────┬────┘
              │ payment success
              ▼
         ┌─────────┐
    ┌───►│ ACTIVE  │◄────┐
    │    └────┬────┘     │
    │         │          │ resume
    │  pause  │          │
    │         ▼          │
    │    ┌─────────┐     │
    │    │ PAUSED  │─────┘
    │    └─────────┘
    │         │
    │  renew  │ cancel / payment failures
    │         ▼
    │    ┌──────────┐     ┌─────────┐
    └────┤ RENEWED  │     │CANCELLED│
         └──────────┘     └─────────┘
                          ┌─────────┐
                          │ EXPIRED │ (after max retries)
                          └─────────┘
```

### 3.2.11 Communication

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-COMM-001 | The system shall provide in-app messaging | High |
| FR-COMM-002 | The system shall create conversation on confirmation | High |
| FR-COMM-003 | The system shall allow text (2000 chars) | High |
| FR-COMM-004 | The system shall allow images (5MB) | Medium |
| FR-COMM-005 | The system shall display timestamps | High |
| FR-COMM-006 | The system shall show read status | Medium |
| FR-COMM-007 | The system shall send push for messages | High |
| FR-COMM-008 | The system shall preserve history 12 months | High |
| FR-COMM-009 | The system shall support dispute evidence | High |
| FR-COMM-010 | The system shall warn on contact sharing | Medium |
| FR-COMM-011 | The system shall allow reporting messages | High |

### 3.2.12 Payments

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PAY-001 | The system shall support M-Pesa | High |
| FR-PAY-002 | The system shall support e-Mola | High |
| FR-PAY-003 | The system shall support Visa/Mastercard | High |
| FR-PAY-004 | The system shall allow saving payment methods | Medium |
| FR-PAY-005 | The system shall process in MZN | High |
| FR-PAY-006 | The system shall hold in escrow | High |
| FR-PAY-007 | The system shall release on completion | High |
| FR-PAY-008 | The system shall deduct platform commission | High |
| FR-PAY-009 | The system shall apply configurable commission | High |
| FR-PAY-010 | The system shall display earnings breakdown | High |
| FR-PAY-011 | The system shall support tipping | Medium |
| FR-PAY-012 | The system shall pass 100% tips to provider | Medium |
| FR-PAY-013 | The system shall process refunds per policy | High |
| FR-PAY-014 | The system shall generate receipts | High |
| FR-PAY-015 | The system shall maintain transaction history | High |
| FR-PAY-016 | The system shall use a payment intent pattern (pending → processing → completed/failed/expired) | High |
| FR-PAY-017 | The system shall allow payment retries within the timeout window | Medium |
| FR-PAY-018 | The system shall track individual payment transactions per intent (attempts, captures, refunds) | Medium |
| FR-PAY-019 | The system shall expire payment intents after configurable timeout | High |

### 3.2.13 Provider Payouts

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-POUT-001 | The system shall track balance (pending/available) | High |
| FR-POUT-002 | The system shall move to available on completion | High |
| FR-POUT-003 | The system shall allow payout requests | High |
| FR-POUT-004 | The system shall support M-Pesa payouts | High |
| FR-POUT-005 | The system shall support e-Mola payouts | High |
| FR-POUT-006 | The system shall support bank payouts | Medium |
| FR-POUT-007 | The system shall enforce minimum threshold | High |
| FR-POUT-008 | The system shall process within 2 business days | High |
| FR-POUT-009 | The system shall notify on processing | High |
| FR-POUT-010 | The system shall provide payout history | Medium |

### 3.2.14 Reviews and Ratings

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-REV-001 | The system shall prompt review after completion | High |
| FR-REV-002 | The system shall allow 1-5 star rating | High |
| FR-REV-003 | The system shall allow text review (500 chars) | High |
| FR-REV-004 | The system shall allow sub-ratings: punctuality, quality, communication (1-5 each) | Medium |
| FR-REV-005 | The system shall allow provider to rate customer | Medium |
| FR-REV-006 | The system shall limit to 7 days after completion | High |
| FR-REV-007 | The system shall display on profile | High |
| FR-REV-008 | The system shall calculate average rating | High |
| FR-REV-009 | The system shall allow provider response | Medium |
| FR-REV-010 | The system shall allow reporting reviews | Medium |
| FR-REV-011 | The system shall not allow editing reviews | High |

### 3.2.15 Notifications

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-NOT-001 | The system shall send push for critical events | High |
| FR-NOT-002 | The system shall send email for bookings | High |
| FR-NOT-003 | The system shall send SMS (optional) | Medium |
| FR-NOT-004 | The system shall allow preferences | Medium |
| FR-NOT-005 | The system shall maintain notification center | High |
| FR-NOT-006 | The system shall track read/unread | Medium |

**Notification Matrix:**

| Event | Push | Email | SMS |
|-------|------|-------|-----|
| New booking | ✓ | ✓ | ✓ |
| Confirmed | ✓ | ✓ | ✓ |
| Cancelled | ✓ | ✓ | ✓ |
| New message | ✓ | - | - |
| Quote requested | ✓ | ✓ | - |
| Quote received | ✓ | ✓ | - |
| Quote accepted | ✓ | ✓ | ✓ |
| Quote expired | ✓ | ✓ | - |
| New bid | ✓ | ✓ | - |
| Bid accepted | ✓ | ✓ | ✓ |
| Task started | ✓ | - | - |
| Completed | ✓ | ✓ | - |
| Payment | ✓ | ✓ | - |
| Payout | ✓ | ✓ | ✓ |
| New review | ✓ | ✓ | - |
| Verification | ✓ | ✓ | ✓ |
| Reminder | ✓ | - | ✓ |
| Subscription created | ✓ | ✓ | - |
| Subscription renewed | ✓ | ✓ | - |
| Subscription billing failed | ✓ | ✓ | ✓ |
| Subscription cancelled | ✓ | ✓ | - |
| Subscription expiring | ✓ | ✓ | - |
| Recurring booking generated | ✓ | - | - |

### 3.2.16 Administration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ADM-001 | The system shall provide dashboard with metrics | High |
| FR-ADM-002 | The system shall display KPIs | High |
| FR-ADM-003 | The system shall allow user search/view | High |
| FR-ADM-004 | The system shall allow user suspension | High |
| FR-ADM-005 | The system shall allow reactivation | High |
| FR-ADM-006 | The system shall allow deletion (soft) | Medium |
| FR-ADM-007 | The system shall provide verification queue | High |
| FR-ADM-008 | The system shall allow approve/reject | High |
| FR-ADM-009 | The system shall allow category management | High |
| FR-ADM-010 | The system shall allow booking viewing | Medium |
| FR-ADM-011 | The system shall provide dispute queue | Medium |
| FR-ADM-012 | The system shall allow dispute resolution | Medium |
| FR-ADM-013 | The system shall allow payout management | High |
| FR-ADM-014 | The system shall allow configuration | Medium |
| FR-ADM-015 | The system shall maintain audit log | Medium |
| FR-ADM-016 | The system shall support admin roles | Medium |
| FR-ADM-017 | The system shall provide a service approval queue for reviewing new/updated services | High |
| FR-ADM-018 | The system shall allow admin to approve or reject services with a reason | High |
| FR-ADM-019 | The system shall allow configuring platform settings (commission, timeouts, defaults) | High |

---

## 3.3 Usability Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-USE-001 | Registration time | < 3 min |
| NFR-USE-002 | Booking time | < 5 min |
| NFR-USE-003 | Consistent navigation | - |
| NFR-USE-004 | Standard UI conventions | - |
| NFR-USE-005 | Clear error messages | - |
| NFR-USE-006 | Session during connectivity loss | - |

---

## 3.4 Performance Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-001 | App load (3G) | < 3s |
| NFR-PERF-002 | API response (p95) | < 500ms |
| NFR-PERF-003 | Search results | < 2s |
| NFR-PERF-004 | Payment processing | < 10s |
| NFR-PERF-005 | Concurrent users | 10,000 |
| NFR-PERF-006 | API requests/sec | 1,000 |
| NFR-PERF-007 | Push delivery | < 5s |
| NFR-PERF-008 | Image upload (5MB) | < 10s |
| NFR-PERF-009 | Database scale | 1M+ users |

---

## 3.5 Database Requirements

### 3.5.1 Data Entities

| Entity | Retention |
|--------|-----------|
| User (Better Auth) | Lifetime + 30 days |
| Profile | Lifetime |
| ServiceCategory | Permanent |
| Service | Lifetime |
| ServicePackage | Lifetime |
| QuoteRequest | 2 years |
| QuoteResponse | 2 years |
| DiscountRule | Lifetime |
| TaskPost | 2 years |
| Bid | 2 years |
| Booking | 7 years |
| PaymentIntent | 7 years |
| PaymentTransaction | 7 years |
| Payout | 7 years |
| Message | 12 months |
| Review | Lifetime |
| Notification | 90 days |
| Organization | Lifetime |
| OrganizationMember | Lifetime |
| AvailabilityRule | Lifetime |
| AvailabilityTimeWindow | Lifetime |
| AvailabilityException | 1 year |
| ExceptionTimeWindow | 1 year |
| SchedulingConfig | Lifetime |
| Slot | 6 months (rolling) |
| PlatformSettings | Lifetime |
| BookingRecurrence | 2 years |
| SubscriptionPlan | Lifetime |
| ServiceSubscription | 7 years |
| SubscriptionBilling | 7 years |

### 3.5.2 Entity Definitions

```
USER (Better Auth)
├── id, email, emailVerified
├── firstName, lastName, roles, status
└── createdAt, updatedAt

PROFILE (unified — base + provider fields)
├── id, userId
├── phoneCodePrefix, phoneNumber, phoneVerified, profileImageUrl
├── bio (nullable), serviceAreas, skills, portfolioImages
├── identityDocumentUrl, verificationStatus (nullable)
├── verificationRejectedReason
├── averageRating, totalReviews, totalCompletedTasks
└── createdAt, updatedAt

SERVICE_CATEGORY
├── id, name, nameEn, description
├── iconUrl, parentId, isActive, sortOrder
└── createdAt, updatedAt

SERVICE
├── id, providerId (nullable), organizationId (nullable), categoryId
├── providerType (individual, organization)
├── title, description
├── pricingMode (package, hourly, quote)
├── hourlyRate (nullable, for hourly mode)
├── minimumHours (nullable, default 1)
├── acceptsCustomQuotes (boolean)
├── serviceLocationType (at_customer, at_provider, remote, flexible)
├── durationMinutes, bufferMinutes
├── status (draft, pending_approval, approved, published, rejected, unpublished, archived)
├── submittedAt, approvedAt, rejectedAt, rejectionReason, publishedAt
└── createdAt, updatedAt

SERVICE_PACKAGE
├── id, serviceId, providerId
├── name, description
├── fixedPrice, estimatedDurationHours
├── includes (JSON), variables (JSON)
└── isActive, sortOrder, createdAt, updatedAt

QUOTE_REQUEST
├── id, customerId, providerId
├── serviceId (nullable), categoryId
├── title, description, images
├── preferredDate, preferredTime, durationDays (nullable)
├── location (address, lat, lng)
├── status (pending, quoted, accepted, declined, expired, cancelled)
└── createdAt, expiresAt, updatedAt

QUOTE_RESPONSE
├── id, quoteRequestId, providerId
├── totalPrice, priceBreakdown (JSON)
├── discountApplied, discountAmount
├── message, validUntil
├── status (pending, accepted, declined, expired)
└── createdAt, updatedAt

DISCOUNT_RULE
├── id, providerId, serviceId (nullable)
├── discountType (hours_volume, days_volume, recurring, first_time)
├── threshold, discountPercentage
├── description
└── isActive, createdAt, updatedAt

TASK_POST
├── id, customerId, categoryId
├── title, description, location (address, lat, lng)
├── preferredDate, preferredTime, budget (min, max)
├── images, status
└── createdAt, updatedAt, expiresAt

BID
├── id, taskId, providerId
├── proposedPrice, message
├── proposedDate, proposedTime, status
└── createdAt, updatedAt

BOOKING
├── id, customerId, providerId
├── providerType (individual, organization)
├── organizationId (nullable), staffMemberId (nullable)
├── serviceId, packageId (nullable), taskId (nullable)
├── bidId (nullable), quoteResponseId (nullable)
├── recurrenceId (nullable, FK → BookingRecurrence)
├── bookingPath (package, hourly, custom_quote, task_bid)
├── serviceLocation (at_customer, at_provider, remote)
├── scheduledDate, scheduledStartTime, scheduledEndTime
├── estimatedDurationMinutes, actualDurationMinutes (nullable)
├── location (address, lat, lng), description, images
├── baseAmount, discountAmount, totalAmount
├── platformFee, providerEarnings, tipAmount
├── snapshot (JSON - service name, package details, slot time, pricing at booking time)
├── status (pending, pending_payment, confirmed, in_progress, completed, cancelled, disputed, expired)
├── paymentExpiresAt (nullable)
├── startedAt, completedAt, customerConfirmedAt
└── cancelledAt, cancellationReason, createdAt

BOOKING_RECURRENCE
├── id, customerId, providerType, providerId (nullable), organizationId (nullable)
├── serviceId, packageId (nullable)
├── frequency (weekly, biweekly, monthly)
├── dayOfWeek (nullable), dayOfMonth (nullable)
├── preferredStartTime
├── serviceLocation, location (address, lat, lng)
├── totalOccurrences (nullable), occurrencesCreated
├── startDate, endDate (nullable)
├── status (active, paused, cancelled, completed)
├── autoPay (boolean)
└── createdAt, updatedAt

SUBSCRIPTION_PLAN
├── id, serviceId, providerType, providerId (nullable), organizationId (nullable)
├── name, description
├── price, currency, billingFrequency (monthly, quarterly, annual)
├── includes (JSON)
├── maxSubscribers (nullable)
├── isActive, sortOrder
└── createdAt, updatedAt

SERVICE_SUBSCRIPTION
├── id, customerId, subscriptionPlanId
├── providerType, providerId (nullable), organizationId (nullable), serviceId
├── billingFrequency, pricePerCycle (locked at subscription time)
├── currentPeriodStart, currentPeriodEnd, nextBillingDate
├── status (pending, active, paused, cancelled, expired)
├── startedAt, pausedAt, resumedAt, cancelledAt, cancellationReason
└── createdAt, updatedAt

SUBSCRIPTION_BILLING
├── id, subscriptionId, paymentIntentId (nullable)
├── billingPeriodStart, billingPeriodEnd
├── amount, currency, platformFee, providerEarnings
├── status (pending, paid, failed, refunded)
├── retryCount, paidAt, failedAt
└── createdAt, updatedAt

PAYMENT_INTENT
├── id, bookingId (nullable), subscriptionBillingId (nullable), payerId
├── amount, currency, paymentMethod, paymentProcessor
├── status (pending, processing, completed, failed, cancelled, expired)
├── expiresAt, metadata (JSON)
└── createdAt, updatedAt

PAYMENT_TRANSACTION
├── id, paymentIntentId
├── processorTransactionId (external reference)
├── amount, currency
├── status (pending, captured, failed, refunded, partially_refunded)
├── platformFee, providerPayout
├── webhookData (JSON)
├── paidAt, failedAt, refundedAt
└── createdAt

PAYOUT
├── id, providerId, amount, currency
├── method, destination, status
└── processedAt, failureReason, createdAt

MESSAGE
├── id, conversationId, senderId, receiverId
├── bookingId, content, imageUrl
└── isRead, readAt, createdAt

REVIEW
├── id, bookingId, reviewerId, revieweeId
├── overallRating (1-5)
├── punctualityRating (1-5, nullable)
├── qualityRating (1-5, nullable)
├── communicationRating (1-5, nullable)
├── comment
└── response, respondedAt, createdAt

NOTIFICATION
├── id, userId, type, title
├── message, data, isRead
└── readAt, createdAt

ORGANIZATION
├── id, ownerId, name, description
├── logoUrl, coverPhotos, address, lat, lng
├── phone, email, website
├── organizationType, verificationStatus, verificationDocumentUrl
├── averageRating, totalReviews, totalCompletedBookings
└── isActive, createdAt, updatedAt

ORGANIZATION_MEMBER
├── id, organizationId, userId
├── role (owner, manager, staff)
├── displayName, photoUrl, specialties
└── isActive, joinedAt, updatedAt

AVAILABILITY_RULE (flexible rules for individuals, organizations, and staff)
├── id, ownerType (individual, organization, staff), ownerId
├── ruleType (weekly_recurring, date_range, one_time)
├── daysOfWeek (JSON array, for weekly_recurring)
├── startDate, endDate (for date_range)
├── date (for one_time)
├── effectiveFrom, effectiveUntil (nullable)
├── isActive, description (nullable)
└── createdAt, updatedAt

AVAILABILITY_TIME_WINDOW (multiple windows per rule)
├── id, availabilityRuleId
├── startTime (HH:mm), endTime (HH:mm)
└── sortOrder

AVAILABILITY_EXCEPTION (block or override specific dates)
├── id, ownerType, ownerId
├── exceptionType (blocked, special)
├── date, reason (nullable)
└── createdAt, updatedAt

EXCEPTION_TIME_WINDOW (custom hours for SPECIAL exceptions)
├── id, availabilityExceptionId
├── startTime (HH:mm), endTime (HH:mm)
└── sortOrder

SCHEDULING_CONFIG (per-owner scheduling settings)
├── id, ownerType (individual, organization), ownerId
├── advanceBookingDays (default 30)
├── cutoffHours (default 2)
├── bufferMinutes (default 0)
├── timezone (nullable)
└── createdAt, updatedAt

SLOT (persisted time slots for capacity tracking)
├── id, ownerType, ownerId, serviceId (nullable)
├── startDateTime, endDateTime
├── capacity (1 for individual, N for organization)
├── bookedSpots (default 0), availableSpots (= capacity - bookedSpots)
├── sourceType (rule, exception), sourceId
└── createdAt, updatedAt

PLATFORM_SETTINGS
├── id, commissionPercentage
├── defaultPaymentTimeoutMinutes (30)
├── defaultCutoffHours (2)
├── defaultAdvanceBookingDays (30)
├── defaultCancellationWindowHours (24)
├── defaultQuoteExpirationHours (48)
├── defaultTaskExpirationDays (7)
├── defaultBookingAcceptanceHours (24)
├── defaultCompletionConfirmationHours (24)
└── createdAt, updatedAt
```

---

## 3.6 Design Constraints

| ID | Constraint | Rationale |
|----|------------|-----------|
| NFR-CON-001 | Hexagonal Architecture (onion-lasagna) | Clean separation, testability |
| NFR-CON-002 | Domain-Driven Design patterns | Complex domain modeling |
| NFR-CON-003 | Bun runtime | Performance, TypeScript-native |
| NFR-CON-004 | Turborepo monorepo | Build optimization, code sharing |
| NFR-CON-005 | Hono API framework | Lightweight, edge-compatible |
| NFR-CON-006 | Better Auth for authentication | Full-featured, TypeScript |
| NFR-CON-007 | Zod for validation | Runtime type checking |
| NFR-CON-008 | PostgreSQL (serverless) + Drizzle ORM | Neon/Supabase/PlanetScale |
| NFR-CON-009 | React Native for mobile | Cross-platform |
| NFR-CON-010 | Next.js for web | SSR, React ecosystem |
| NFR-CON-011 | Serverless deployment | No container management |
| NFR-CON-012 | Edge-first architecture | Low latency, global |
| NFR-CON-013 | PCI DSS compliance | Payment security |

### 3.6.1 Serverless Infrastructure

| Component | Service Options |
|-----------|-----------------|
| **API** | Vercel Functions, Cloudflare Workers, AWS Lambda |
| **Database** | Neon (PostgreSQL), Supabase, PlanetScale |
| **Storage** | Cloudflare R2, AWS S3, Supabase Storage |
| **Auth** | Better Auth (self-hosted on serverless) |
| **Queue/Jobs** | Upstash QStash, Inngest, Trigger.dev |
| **Caching** | Upstash Redis, Vercel KV |
| **WebSockets** | Ably, Pusher, PartyKit |
| **Email** | Resend, SendGrid |
| **SMS** | Twilio |
| **Push** | Firebase Cloud Messaging |

---

## 3.7 System Attributes

### 3.7.1 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-REL-001 | Uptime | 99.9% |
| NFR-REL-002 | MTTR | < 1 hour |
| NFR-REL-003 | Graceful failure handling | - |
| NFR-REL-004 | Auto failover | - |

### 3.7.2 Security

| ID | Requirement |
|----|-------------|
| NFR-SEC-001 | TLS 1.2+ for transit |
| NFR-SEC-002 | AES-256 at rest |
| NFR-SEC-003 | Better Auth password hashing |
| NFR-SEC-004 | Better Auth sessions |
| NFR-SEC-005 | Rate limiting |
| NFR-SEC-006 | Input validation |
| NFR-SEC-007 | CSRF protection |
| NFR-SEC-008 | SQL injection prevention |
| NFR-SEC-009 | Auth logging |
| NFR-SEC-010 | Admin audit logging |
| NFR-SEC-011 | OWASP Top 10 compliance |

### 3.7.3 Scalability

| ID | Requirement |
|----|-------------|
| NFR-SCL-001 | Horizontal scaling |
| NFR-SCL-002 | Database read replicas |
| NFR-SCL-003 | Redis caching |
| NFR-SCL-004 | CDN for assets |
| NFR-SCL-005 | Multi-region support |
| NFR-SCL-006 | Message queues |

### 3.7.4 Maintainability

| ID | Requirement |
|----|-------------|
| NFR-MNT-001 | > 80% documentation |
| NFR-MNT-002 | Comprehensive logging |
| NFR-MNT-003 | Semantic versioning |
| NFR-MNT-004 | Feature flags |
| NFR-MNT-005 | Zero-downtime migrations |
| NFR-MNT-006 | > 70% test coverage |
| NFR-MNT-007 | CI/CD pipeline |

---

## 3.8 Localization

| ID | Requirement |
|----|-------------|
| NFR-LOC-001 | Portuguese (pt-MZ) primary |
| NFR-LOC-002 | English secondary |
| NFR-LOC-003 | MZN currency |
| NFR-LOC-004 | Format: X.XXX,XX MZN |
| NFR-LOC-005 | Timezone: Africa/Maputo (UTC+2) |
| NFR-LOC-006 | Date: DD/MM/YYYY |
| NFR-LOC-007 | Time: 24-hour |
| NFR-LOC-008 | Phone: +258 XX XXX XXXX |

---

# 4. VERIFICATION

## 4.1 Methods

| Method | Description |
|--------|-------------|
| Test | Execute test cases |
| Inspection | Manual review |
| Analysis | System evaluation |
| Demonstration | Operational demo |

## 4.2 Acceptance Criteria

1. All **High** priority requirements verified
2. ≥95% of **Medium** requirements verified
3. 99% uptime during acceptance
4. Performance benchmarks met
5. No critical security vulnerabilities
6. ≥90% user satisfaction

---

# 5. APPENDICES

## 5.1 Booking State Diagram

```
            ┌─────────┐
            │ PENDING │
            └────┬────┘
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
   DECLINED   ACCEPTED   TIMEOUT
                 │        (auto-cancel)
                 ▼
          ┌──────────────┐
          │PENDING_PAYMENT│
          └──────┬───────┘
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
   EXPIRED   CONFIRMED   FAILED
   (timeout)     │        (retry?)
                 ▼
           IN_PROGRESS
                 │
                 ▼
            COMPLETED
            (pending confirmation)
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
   DISPUTED  CONFIRMED  AUTO-CONFIRM
                 │        (24h timeout)
                 ▼
             RESOLVED
```

## 5.2 Open Issues

| ID | Issue | Owner |
|----|-------|-------|
| ISSUE-001 | Commission percentage (configurable via PLATFORM_SETTINGS) | Business |
| ISSUE-002 | Minimum payout threshold | Business |
| ISSUE-003 | Cancellation time windows | Business |
| ISSUE-004 | M-Pesa API credentials | Technical |
| ISSUE-005 | e-Mola API credentials | Technical |
| ISSUE-006 | Better Auth configuration | Technical |
| ISSUE-007 | Maximum hourly booking cap to protect customers | Business |
| ISSUE-008 | Maximum discount percentage providers can set | Business |
| ISSUE-009 | Custom quote deposit vs full payment upfront | Business |
| ISSUE-010 | Category-specific package templates for providers | Product |
| ISSUE-011 | Max staff per organization plan/tier | Business |
| ISSUE-012 | Video call support for remote services | Technical |
| ISSUE-013 | Slot regeneration strategy: triggered vs scheduled batch | Technical |
| ISSUE-014 | Service approval SLA for admins | Business |
| ISSUE-015 | Partial payments / deposits for high-value bookings | Business |
| ISSUE-016 | Booking snapshot content scope (service+pricing only, or include profile data?) | Product |
| ISSUE-017 | Subscription cancellation policy: immediate or end-of-period? Mid-cycle refunds? | Business |
| ISSUE-018 | Maximum subscription plans per service | Product |
| ISSUE-019 | Recurring booking auto-pay vs manual payment per occurrence | Business |
| ISSUE-020 | How many bookings ahead to generate for recurring series (default: 4) | Product |
| ISSUE-021 | Should subscription plans support trial periods (first month free)? | Business |

---

**Document End**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared | | 2026-01-15 | |
| Reviewed | | | |
| Approved | | | |
