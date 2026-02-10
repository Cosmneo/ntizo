# Ntizo - Service Marketplace Platform
## Requirements Definition Document

**Version:** 3.1
**Target Market:** Global (Mozambique as initial launch market)
**Platforms:** Web Application + Mobile Apps (iOS & Android)

---

## 1. OVERVIEW

### 1.1 Product Vision
A global service marketplace platform connecting customers who need services with verified providers — both individuals and organizations. Supports multiple service delivery modes (on-site at customer, at provider location, or remote), flexible pricing models, and slot-based scheduling.

### 1.2 Key Stakeholders
- **Customers** - People who need services/tasks completed
- **Individual Providers** - Professionals offering services on their own
- **Organizations** - Establishments (salons, workshops, agencies, etc.) offering services at a fixed location or via their staff
- **Platform Administrators** - Internal team managing the platform

### 1.3 Provider Types

The platform supports two types of service providers:

| Aspect | Individual Provider | Organization (Establishment) |
|--------|-------------------|--------------------------|
| Who | A single person | A registered organization/shop |
| Location | Goes to customer OR works remotely | Has a fixed address (customers come to them) OR sends staff to customer |
| Staff | Just themselves | Can have multiple team members |
| Examples | Plumber, cleaner, tutor, freelancer | Barbershop, salon, mechanic workshop, restaurant, agency |
| Scheduling | Personal availability | Organization hours + slot-based scheduling with buffers |

A user can be **both** — offer individual services AND own one or more organizations.

### 1.4 Service Location Types

Every service defines **where** it happens:

| Location Type | Description | Example |
|---------------|-------------|---------|
| `at_customer` | Provider/staff goes to the customer's location | Plumber, cleaner, home cook |
| `at_provider` | Customer goes to the provider's location | Barbershop, salon, mechanic |
| `remote` | Done remotely via video/chat | Online tutoring, tech support, translation |
| `flexible` | Customer chooses (at their place or at provider's) | Makeup artist, personal trainer, photographer |

---

## 2. USER TYPES & ROLES

### 2.1 Customer
- Can browse and search for services (from individuals and organizations)
- Can book a provider's fixed-price package directly
- Can book a provider by the hour
- Can request a custom quote from a specific provider or organization
- Can post tasks for multiple providers to bid on
- Can choose service location when service is `flexible`
- Can communicate with providers
- Can make payments
- Can rate and review providers and organizations

### 2.2 Individual Provider
- Can create a professional profile
- Can create service packages with fixed prices (recommended)
- Can set hourly rates for time-based services
- Can define service location type per service (at_customer, remote, flexible)
- Can define service area/radius for `at_customer` services
- Can respond to custom quote requests with personalized pricing
- Can configure volume discounts (more hours/days = lower price)
- Can set recurring availability schedule with time slots
- Can configure buffer time between appointments
- Can browse and bid on posted tasks
- Can accept direct bookings
- Can communicate with customers
- Can receive payments
- Can view earnings and analytics

### 2.3 Organization Owner
- Can create and manage one or more organizations (establishments)
- Can set organization profile (name, logo, description, photos, address)
- Can define organization operating hours
- Can add team members (staff) with roles (manager, staff)
- Can create services under the organization
- Can define service location type per service (at_provider, at_customer, remote, flexible)
- Can configure slot-based scheduling (service duration + buffer time)
- Can set pricing per service (packages, hourly, quotes)
- Can configure volume discounts
- Can view organization analytics and earnings

### 2.4 Organization Staff Member
- Can view assigned bookings
- Can mark bookings as started/completed
- Can communicate with customers for assigned bookings
- Can set personal availability within organization hours

### 2.5 Administrator
- Can manage users (approve, suspend, verify)
- Can manage organizations (approve, suspend)
- Can manage service categories
- Can handle disputes
- Can view platform analytics
- Can manage payments and payouts
- Can configure platform settings

---

## 3. PRICING MODEL & BOOKING PATHS

The platform supports **4 distinct paths** for hiring a service — from an individual provider or an organization. The pricing model adapts to the nature of the service, giving both customers and providers flexibility while minimizing price uncertainty. All paths work for both individual providers and organizations.

Each booking path can be used in **three engagement modes**:

| Mode | Description | Example |
|------|-------------|---------|
| **One-Time** | Single booking, one payment, done | "Clean my house this Saturday" |
| **Recurring** | Repeating bookings with a pattern (weekly/biweekly/monthly), each with its own slot | "Clean my house every Monday at 10h" |
| **Subscription** | Ongoing service relationship with automatic periodic billing, no specific slot per cycle | "Monthly accounting services" |

### 3.0.1 Path A: Fixed-Price Package (Recommended - Primary)

The provider creates pre-defined service packages with a fixed price. The customer knows exactly how much they will pay before booking. This is the **default and recommended** pricing mode.

**Example:** "Regular Cleaning T2 apartment - 3,500 MZN (~3 hours, materials included)"

| Aspect | Detail |
|--------|--------|
| Price set by | Provider (creates packages in advance) |
| Customer sees | Exact price before booking |
| Duration | Estimated (for reference), not billed by time |
| Best for | Cleaning, assembly, beauty, simple repairs, tutoring sessions |
| Risk for customer | None (price is locked) |
| Risk for provider | Low (they set the price based on experience) |

### 3.0.2 Path B: Hourly Rate

The provider sets a per-hour rate. The customer books a minimum number of hours. Final price may adjust based on actual time worked.

**Example:** "Personal Assistant - 800 MZN/hour, minimum 1 hour"

| Aspect | Detail |
|--------|--------|
| Price set by | Provider (hourly rate) |
| Customer sees | Estimated total based on booked hours |
| Duration | Minimum 1 hour, 15-minute increments after |
| Best for | Personal assistants, babysitting, gardening, ongoing tutoring |
| Risk for customer | Medium (final price may differ from estimate) |
| Risk for provider | Low (paid for actual time) |

### 3.0.3 Path C: Custom Quote Request (from a Specific Provider)

The customer visits a specific provider's profile and requests a **personalized quote** for something that doesn't fit the provider's existing packages. The provider responds with a tailored price, which may include volume discounts.

**Example:** Customer asks João (a cook): "I need a cook for 5 days, lunch and dinner, for 10 people." João responds: "22,500 MZN (4,500 MZN/day × 5 days, 10% volume discount applied)."

| Aspect | Detail |
|--------|--------|
| Price set by | Provider (custom response to specific request) |
| Customer sees | Nothing until provider responds with quote |
| Duration | Defined in the quote |
| Best for | Multi-day work, custom requests, large jobs from a trusted provider |
| Risk for customer | None after accepting (price is agreed) |
| Risk for provider | None (they define the price) |

### 3.0.4 Path D: Task Posting with Bidding (Open to Multiple Providers)

The customer posts a task publicly. Multiple providers can see it and submit proposals (bids) with their price. The customer compares and chooses.

**Example:** Customer posts: "Paint T3 apartment in Sommerschield." Three painters respond with different prices.

| Aspect | Detail |
|--------|--------|
| Price set by | Providers (competitive bids) |
| Customer sees | Multiple offers to compare |
| Duration | Defined by each bidder |
| Best for | Large projects, renovations, moving, events, when customer wants options |
| Risk for customer | None after accepting (price is agreed) |
| Risk for provider | May not win the bid |

### 3.0.5 Volume Discounts

Providers can configure discount rules that apply automatically or that they can offer in custom quotes:

| Discount Type | Example | Applies To |
|---------------|---------|------------|
| Hours volume | Book 5+ hours → 10% off | Hourly services |
| Days volume | Book 3+ days → 15% off | Multi-day packages or quotes |
| Recurring | Weekly booking → 20% off | All pricing modes |
| First-time | New customer → 10% off first booking | All pricing modes |

### 3.0.6 Recurring Bookings

A recurring booking is a **repeating series of individual bookings** based on a pattern. Each occurrence has its own slot, lifecycle, and payment.

| Aspect | Detail |
|--------|--------|
| Frequency | Weekly, biweekly (every 2 weeks), or monthly |
| Slot | Each occurrence books a specific time slot |
| Payment | Per-booking (default) or pre-paid for the period |
| Booking lifecycle | Each generated booking follows the normal lifecycle |
| Discount | Recurring discount rule applied automatically |
| Management | Customer can skip/cancel individual occurrences or cancel the entire series |
| Generation | System auto-generates the next N bookings in advance (configurable, default: 4 ahead) |

**Example:** "House cleaning every Monday at 10:00 → 20% recurring discount applied"

**Applies to:** Path A (Package) and Path B (Hourly). Not applicable to Path C (quotes are one-off by nature) or Path D (task bidding is one-off).

### 3.0.7 Service Subscriptions

A subscription is an **ongoing service relationship** with automatic periodic billing. Unlike recurring bookings, subscriptions do not require a specific time slot for each cycle — the provider delivers the service continuously within the billing period.

| Aspect | Detail |
|--------|--------|
| Billing frequency | Monthly, quarterly, or annual |
| Payment | Automatic recurring charge at the start of each billing cycle |
| Slot | Not required per cycle (service is ongoing, not appointment-based) |
| Provider setup | Provider creates subscription plans on their service (name, price, includes, frequency) |
| Customer flow | Customer subscribes → first payment → auto-renew → pause/cancel anytime |
| Lifecycle | pending → active → paused → cancelled / expired |
| Cancellation | Effective at end of current billing period (no mid-cycle refund by default) |
| Failed payment | Retry up to 3 times; expire subscription after repeated failures |

**Example:** "Monthly Accounting Basic - 15,000 MZN/month (includes: monthly financial statements, tax filing, consultation hours)"

**Best for:** Professional services (accounting, legal), ongoing maintenance, retainer-based work, recurring consulting.

### 3.0.8 Category-to-Pricing Mapping

Each service category has a **recommended default pricing mode**, though providers can override:

| Category | Default Mode | Engagement | Rationale |
|----------|-------------|------------|-----------|
| Home Cleaning | Fixed Package | One-time or Recurring | Customers need price certainty; weekly cleaning is common |
| Repairs | Fixed Package or Quote | One-time | Simple fixes = package; complex = quote |
| Assembly | Fixed Package | One-time | Price per item type |
| Moving | Quote or Task Post | One-time | Varies heavily by volume and distance |
| Gardening | Hourly or Package | One-time or Recurring | Ongoing = recurring weekly; one-time = package |
| Personal Assistant | Hourly | One-time or Recurring | Time-based; can be recurring weekly |
| Events | Quote or Task Post | One-time | Highly customized |
| Beauty | Fixed Package | One-time or Recurring | Standardized; monthly haircuts common |
| Tutoring | Hourly or Package | One-time or Recurring | Per session; recurring weekly/biweekly common |
| Technology | Quote or Task Post | One-time | Scope varies widely |
| Professional | Quote or Subscription | One-time or Subscription | Accounting, legal → monthly subscription; one-off consulting = quote |
| Automotive | Fixed Package | One-time | Standardized services |

---

## 4. AVAILABILITY & SCHEDULING MODEL

The scheduling system adapts to the provider type and service nature.

### 4.1 Individual Provider Availability

Individual providers define **recurring weekly availability** with optional date-specific overrides. Supports **multiple time windows per day** (e.g., morning and afternoon shifts with a lunch break).

| Setting | Description | Example |
|---------|-------------|---------|
| Weekly schedule | Recurring time blocks per day of week | Mon-Fri: 08:00-12:00, 14:00-18:00 |
| Multiple windows/day | Support for split schedules (breaks, lunch) | Morning: 09:00-12:00, Afternoon: 14:00-18:00 |
| Date overrides | Block specific dates or set custom hours | Dec 25: unavailable; Dec 31: 09:00-13:00 only |
| Date range rules | Different schedule for a period | Summer (Jun-Aug): 07:00-15:00 |
| One-time rules | Special schedule for a single date | Wedding event: Jan 15 only, 06:00-22:00 |
| Service duration | How long each service/package takes | Haircut: 30 min, Deep clean: 4 hours |
| Buffer time | Rest/travel time between appointments | 15 min between appointments |
| Cutoff time | Minimum notice before a slot can be booked | 2 hours before slot start |
| Advance booking | Maximum days ahead a customer can book | 30 days |
| Instant booking | Allow customers to book without approval | On/Off per service |

**Slot generation (for appointment-based services):**
```
Time windows: 09:00-12:00 and 14:00-18:00 (lunch break 12:00-14:00)
Service duration: 45 min
Buffer: 15 min
Slot size = 45 + 15 = 60 min

Morning slots:
  09:00 - 09:45 (service) → 09:45 - 10:00 (buffer)
  10:00 - 10:45 (service) → 10:45 - 11:00 (buffer)
  11:00 - 11:45 (last morning slot)

Afternoon slots:
  14:00 - 14:45 (service) → 14:45 - 15:00 (buffer)
  15:00 - 15:45 (service) → 15:45 - 16:00 (buffer)
  16:00 - 16:45 (service) → 16:45 - 17:00 (buffer)
  17:00 - 17:45 (last slot)
```

### 4.2 Organization Availability

Organizations define **operating hours** at the organization level, with optional per-staff and per-service scheduling. Supports **multiple time windows per day** (e.g., morning and evening shifts).

| Setting | Description | Example |
|---------|-------------|---------|
| Operating hours | Organization open/close times per day (multiple windows) | Mon-Sat: 09:00-13:00, 14:00-18:00, Sun: closed |
| Service duration | Duration per service offered | Men's haircut: 30 min, Nails: 60 min |
| Buffer time | Time between client appointments | 15 min (cleanup, preparation) |
| Concurrent capacity | How many clients at once (based on staff/stations) | 3 barbers = 3 concurrent slots |
| Staff schedules | Per-member availability within organization hours (multiple windows) | João: Mon-Fri 09:00-17:00, Maria: Tue-Sat 10:00-14:00, 15:00-18:00 |
| Holidays/closures | Organization-level date overrides | Dec 25: closed |
| Special dates | Custom hours for specific dates | Dec 31: 09:00-13:00 only |
| Cutoff time | Minimum notice before slot can be booked | 1 hour before |
| Advance booking | Maximum days ahead customers can book | 60 days |

**Multi-staff slot generation (e.g., barbershop with 2 barbers):**
```
Organization hours: 09:00 - 18:00
Service: Men's Haircut (30 min + 10 min buffer)

Barber A schedule: 09:00 - 18:00
Barber B schedule: 10:00 - 18:00

Available slots at 09:00: 1 (only Barber A)
Available slots at 10:00: 2 (Barber A + Barber B)
Available slots at 10:40: 2 (Barber A + Barber B)
...

When customer books 10:00 → assigned to Barber A or B
When 2nd customer books 10:00 → assigned to remaining barber
When 3rd customer tries 10:00 → FULL, next slot: 10:40
```

### 4.3 Availability Rule Types

The availability system supports three types of rules, listed by priority:

| Rule Type | Description | Use Case |
|-----------|-------------|----------|
| `WEEKLY_RECURRING` | Repeats on specified days each week | Regular weekly schedule (Mon-Fri 09:00-18:00) |
| `DATE_RANGE` | Applies to a specific date range | Summer hours (Jun 1 - Aug 31: 07:00-15:00) |
| `ONE_TIME` | Applies to a single date | Special event (Jan 15: 06:00-22:00) |

**Exception types** override rules for specific dates:

| Exception Type | Description | Use Case |
|----------------|-------------|----------|
| `BLOCKED` | No availability on this date | Holiday, personal day, vacation |
| `SPECIAL` | Custom hours for this date (overrides all rules) | Half-day on Dec 31 (09:00-13:00) |

**Priority:** Exceptions > ONE_TIME > DATE_RANGE > WEEKLY_RECURRING

### 4.4 Slot Persistence & Capacity

Generated slots are **persisted as entities** to enable capacity tracking and prevent double-booking:

- Each slot tracks: `capacity`, `bookedSpots`, `availableSpots`
- Invariant: `bookedSpots + availableSpots = capacity`
- Individual provider slots: capacity = 1
- Organization slots: capacity = number of available staff for that time
- When a booking is confirmed, `bookedSpots` is incremented and `availableSpots` decremented
- When a booking is cancelled, the inverse happens
- Slots are regenerated when availability configuration changes

### 4.5 Scheduling Rules

| Rule | Description |
|------|-------------|
| Cutoff time | Minimum time before slot start to book (e.g., 2 hours) |
| Maximum advance | How far ahead bookings are allowed (e.g., 30 days) |
| Cancellation window | Minimum time to cancel without penalty (e.g., 24 hours) |
| Auto-accept | Provider can enable auto-accept for bookings within available slots |
| Overbooking prevention | System prevents double-booking of same slot/staff via persisted slot capacity |

### 4.6 Service Location Impact on Scheduling

| Location Type | Scheduling Behavior |
|---------------|-------------------|
| `at_customer` | Slots include travel buffer; provider sets larger buffer time |
| `at_provider` | Tight slots possible; buffer is just cleanup/prep time |
| `remote` | Minimal buffer; back-to-back possible |
| `flexible` | Slot size adapts based on customer's chosen location |

---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Authentication & User Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-001 | Users can register with email, phone number, or social login | High |
| FR-AUTH-002 | Users can login with email/phone and password | High |
| FR-AUTH-003 | Users can reset password via email or SMS | High |
| FR-AUTH-004 | Support OTP verification for phone numbers | High |
| FR-AUTH-005 | Users can switch between Customer and Provider modes | Medium |
| FR-AUTH-006 | Session management with secure token handling | High |

### 5.2 Customer Features

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CUST-001 | Customer can create and manage profile | High |
| FR-CUST-002 | Customer can browse service categories | High |
| FR-CUST-003 | Customer can search for services by keyword, location, price (from individuals and organizations) | High |
| FR-CUST-004 | Customer can view provider/organization profiles with ratings, reviews, and packages | High |
| FR-CUST-005 | Customer can book a fixed-price package directly (Path A) | High |
| FR-CUST-006 | Customer can book by the hour with estimated duration (Path B) | High |
| FR-CUST-007 | Customer can request a custom quote from a specific provider or organization (Path C) | High |
| FR-CUST-008 | Customer can view, accept, or decline a custom quote | High |
| FR-CUST-009 | Customer can negotiate a custom quote via chat before accepting | Medium |
| FR-CUST-010 | Customer can post a task for multiple providers to bid on (Path D) | High |
| FR-CUST-011 | Customer can review and accept provider bids | High |
| FR-CUST-012 | Customer can select available time slot from provider's/organization's calendar | High |
| FR-CUST-013 | Customer can add their location for `at_customer` services | High |
| FR-CUST-014 | Customer can see provider/organization location for `at_provider` services | High |
| FR-CUST-015 | Customer can choose location mode when service is `flexible` | High |
| FR-CUST-016 | Customer can describe task with text and images | High |
| FR-CUST-017 | Customer can see volume discounts applied to the booking price | Medium |
| FR-CUST-018 | Customer can cancel a booking (with policy rules) | Medium |
| FR-CUST-019 | Customer can rate and review provider/organization after task completion | High |
| FR-CUST-020 | Customer can view booking history | Medium |
| FR-CUST-021 | Customer can save favorite providers and organizations | Low |
| FR-CUST-022 | Customer can report issues with a booking | Medium |
| FR-CUST-023 | Customer can create a recurring booking (weekly, biweekly, monthly) from Path A or B | High |
| FR-CUST-024 | Customer can skip or cancel individual occurrences of a recurring booking | High |
| FR-CUST-025 | Customer can cancel an entire recurring booking series | High |
| FR-CUST-026 | Customer can subscribe to a provider's subscription plan | High |
| FR-CUST-027 | Customer can view active subscriptions and billing history | High |
| FR-CUST-028 | Customer can pause or resume a subscription | High |
| FR-CUST-029 | Customer can cancel a subscription (effective at end of current period) | High |

### 5.3 Individual Provider Features

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PROV-001 | Provider can create professional profile | High |
| FR-PROV-002 | Provider can add profile photo and portfolio images | High |
| FR-PROV-003 | Provider can select service categories | High |
| FR-PROV-004 | Provider can create fixed-price service packages (name, description, price, estimated duration) | High |
| FR-PROV-005 | Provider can set hourly rate per service category | High |
| FR-PROV-006 | Provider can define service location type per service (at_customer, remote, flexible) | High |
| FR-PROV-007 | Provider can define service area/radius for `at_customer` services | High |
| FR-PROV-008 | Provider can enable/disable "accepts custom quotes" per service | High |
| FR-PROV-009 | Provider can receive and respond to custom quote requests | High |
| FR-PROV-010 | Provider can include a breakdown in custom quotes (per day, per item, etc.) | Medium |
| FR-PROV-011 | Provider can configure volume discount rules (hours, days, recurring, first-time) | Medium |
| FR-PROV-012 | Provider can set recurring weekly availability (e.g., Mon-Fri 09:00-17:00) | High |
| FR-PROV-013 | Provider can define service duration per service/package | High |
| FR-PROV-014 | Provider can set buffer time between appointments (e.g., 15 min) | High |
| FR-PROV-015 | System auto-generates available time slots based on availability + duration + buffer | High |
| FR-PROV-016 | Provider can block specific dates (holidays, personal days) | Medium |
| FR-PROV-017 | Provider can set minimum notice time for bookings (e.g., 2 hours) | Medium |
| FR-PROV-018 | Provider can set maximum advance booking window (e.g., 30 days) | Medium |
| FR-PROV-019 | Provider can enable auto-accept for slot-based bookings | Medium |
| FR-PROV-020 | Provider can browse available tasks to bid on | High |
| FR-PROV-021 | Provider can submit bids with price and message | High |
| FR-PROV-022 | Provider can accept/decline direct bookings | High |
| FR-PROV-023 | Provider can mark task as started/completed | High |
| FR-PROV-024 | Provider can view earnings dashboard | Medium |
| FR-PROV-025 | Provider can request payouts | High |
| FR-PROV-026 | Provider can view and respond to reviews | Medium |
| FR-PROV-027 | Provider can set "busy" or "unavailable" status | Medium |
| FR-PROV-028 | Provider can upload certifications/qualifications | Medium |
| FR-PROV-029 | Services have a lifecycle: draft → pending_approval → approved → published (admin can reject) | High |
| FR-PROV-030 | Provider can set multiple time windows per day (e.g., 09:00-12:00 and 14:00-18:00) | High |
| FR-PROV-031 | Provider can set date-range availability rules (e.g., summer schedule) | Medium |
| FR-PROV-032 | Provider can create subscription plans for their services (name, price, frequency, includes) | High |
| FR-PROV-033 | Provider can manage subscription plans (activate, deactivate, update price for new subscribers) | High |
| FR-PROV-034 | Provider can view active subscribers and subscription analytics | High |
| FR-PROV-035 | Provider can manage recurring bookings from customers (view series, handle individual occurrences) | High |

### 5.4 Organization Features

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-BIZ-001 | User can create one or more organizations (establishment profiles) | High |
| FR-BIZ-002 | Organization has name, logo, description, and cover photos | High |
| FR-BIZ-003 | Organization has a fixed address with GPS coordinates | High |
| FR-BIZ-004 | Organization can set operating hours per day of week | High |
| FR-BIZ-005 | Organization can set holiday/closure dates | Medium |
| FR-BIZ-006 | Organization can select service categories | High |
| FR-BIZ-007 | Organization can create services with location type (at_provider, at_customer, remote, flexible) | High |
| FR-BIZ-008 | Organization can create fixed-price service packages per service | High |
| FR-BIZ-009 | Organization can set hourly rates per service | High |
| FR-BIZ-010 | Organization can enable/disable "accepts custom quotes" per service | High |
| FR-BIZ-011 | Organization can define service duration per service/package | High |
| FR-BIZ-012 | Organization can set buffer time between appointments | High |
| FR-BIZ-013 | System auto-generates available slots based on operating hours + duration + buffer + staff | High |
| FR-BIZ-014 | Organization can add team members (invite by email/phone) | High |
| FR-BIZ-015 | Organization members have roles: owner, manager, staff | High |
| FR-BIZ-016 | Organization can assign services to specific staff members | Medium |
| FR-BIZ-017 | Staff members can set their own schedule within organization hours | Medium |
| FR-BIZ-018 | System supports concurrent slots based on number of available staff | High |
| FR-BIZ-019 | Organization can configure volume discount rules | Medium |
| FR-BIZ-020 | Organization can respond to custom quote requests | High |
| FR-BIZ-021 | Organization can view earnings and analytics dashboard | Medium |
| FR-BIZ-022 | Organization can request payouts | High |
| FR-BIZ-023 | Organization owner can view and manage all bookings for the organization | High |
| FR-BIZ-024 | Staff members can view their assigned bookings | High |
| FR-BIZ-025 | Organization can set minimum notice and max advance booking window | Medium |
| FR-BIZ-026 | Organization can enable auto-accept for slot-based bookings | Medium |
| FR-BIZ-027 | Organization services have a lifecycle: draft → pending_approval → approved → published | High |
| FR-BIZ-028 | Organization can set multiple time windows per day for operating hours | High |
| FR-BIZ-029 | Organization can set special hours for specific dates (override operating hours) | Medium |
| FR-BIZ-030 | Organization can create subscription plans for their services | High |
| FR-BIZ-031 | Organization can manage subscription plans and view subscribers | High |
| FR-BIZ-032 | Organization can manage recurring bookings from customers | High |

### 5.5 Booking & Task Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-BOOK-001 | System supports fixed-price package booking flow (Path A) | High |
| FR-BOOK-002 | System supports hourly booking flow with estimated duration (Path B) | High |
| FR-BOOK-003 | System supports custom quote request and response flow (Path C) | High |
| FR-BOOK-004 | System supports task posting with bidding flow (Path D) | High |
| FR-BOOK-005 | Booking has status lifecycle (pending → pending_payment → confirmed → in_progress → completed, with cancelled/disputed/expired branches) | High |
| FR-BOOK-006 | System sends confirmation notifications | High |
| FR-BOOK-007 | System sends reminders before scheduled tasks (24h and 1h) | Medium |
| FR-BOOK-008 | Both parties can cancel with defined cancellation policy | Medium |
| FR-BOOK-009 | System tracks task completion with timestamps | High |
| FR-BOOK-010 | System supports recurring bookings (weekly, biweekly, monthly) for Path A and Path B | High |
| FR-BOOK-011 | Provider has 24h to accept/decline a direct booking; auto-cancel on timeout | High |
| FR-BOOK-012 | Customer has 24h to confirm completion or dispute; auto-confirm on timeout | High |
| FR-BOOK-013 | Accepted custom quote converts into a booking with agreed price | High |
| FR-BOOK-014 | Accepted bid converts into a booking with bid price | High |
| FR-BOOK-015 | System applies volume discounts automatically when discount rules match | Medium |
| FR-BOOK-016 | Custom quotes expire after 48h if not accepted | Medium |
| FR-BOOK-017 | Task posts expire after 7 days if no bid is accepted | Medium |
| FR-BOOK-018 | Booking tracks service_location (at_customer, at_provider, remote) | High |
| FR-BOOK-019 | Booking tracks provider_type (individual or organization) and organization_id if applicable | High |
| FR-BOOK-020 | Booking can be assigned to a specific staff member (for organization bookings) | High |
| FR-BOOK-021 | System validates selected slot is still available before confirming booking | High |
| FR-BOOK-022 | System prevents double-booking of same slot/staff via persisted slot capacity | High |
| FR-BOOK-023 | System captures a booking snapshot at booking time (service details, slot time, pricing breakdown) for audit trail | High |
| FR-BOOK-024 | Booking transitions to pending_payment after provider acceptance; payment must complete before confirmation | High |
| FR-BOOK-025 | Pending payment bookings expire after configurable timeout (e.g., 30 min) if payment not completed | Medium |
| FR-BOOK-026 | When booking is confirmed, system updates the slot's booked/available spots atomically | High |
| FR-BOOK-027 | When booking is cancelled, system releases the slot's spots back | High |
| FR-BOOK-028 | System auto-generates future bookings for recurring series (default: 4 ahead) | High |
| FR-BOOK-029 | Each generated recurring booking follows the normal lifecycle independently | High |
| FR-BOOK-030 | Customer can skip individual occurrences without cancelling the series | High |
| FR-BOOK-031 | System applies recurring discount automatically to all bookings in a series | High |
| FR-BOOK-032 | Recurring booking generates the next occurrence after current one is completed or at a scheduled interval | High |

### 5.6 Communication

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-COMM-001 | In-app messaging between customer and provider | High |
| FR-COMM-002 | Push notifications for new messages | High |
| FR-COMM-003 | SMS notifications for critical updates | Medium |
| FR-COMM-004 | Email notifications for bookings and payments | High |
| FR-COMM-005 | Chat history preserved for dispute resolution | Medium |
| FR-COMM-006 | Support for sending images in chat | Medium |
| FR-COMM-007 | Custom quote negotiation happens within chat thread | High |

### 5.7 Payments

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PAY-001 | Integration with M-Pesa mobile money | High |
| FR-PAY-002 | Integration with e-Mola mobile money | High |
| FR-PAY-003 | Support for bank card payments (Visa/Mastercard) | High |
| FR-PAY-004 | Payment held in escrow until task completion | High |
| FR-PAY-005 | Automatic release of payment on task completion | High |
| FR-PAY-006 | Platform commission deduction from provider earnings | High |
| FR-PAY-007 | Provider can view pending and available balance | High |
| FR-PAY-008 | Provider can request payout to mobile money or bank | High |
| FR-PAY-009 | Support for tipping providers | Medium |
| FR-PAY-010 | Refund processing for cancelled/disputed bookings | Medium |
| FR-PAY-011 | Transaction history for both users | Medium |
| FR-PAY-012 | Invoice/receipt generation | Medium |
| FR-PAY-013 | Payment uses a payment intent pattern: pending → processing → completed (or failed/expired) | High |
| FR-PAY-014 | Failed payments can be retried within the payment timeout window | Medium |
| FR-PAY-015 | Payment intent tracks individual transactions (attempts, captures, refunds) | Medium |
| FR-PAY-016 | System supports automatic recurring payments for subscriptions | High |
| FR-PAY-017 | System retries failed subscription renewal payments (up to 3 attempts over 7 days) | High |
| FR-PAY-018 | System sends payment reminder before subscription renewal date | Medium |

### 5.8 Subscriptions

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SUB-001 | Provider/Organization can create subscription plans for their services (name, price, billing frequency, includes) | High |
| FR-SUB-002 | Provider/Organization can manage subscription plans (activate, deactivate, update price for new subscribers) | High |
| FR-SUB-003 | Customer can browse and subscribe to available subscription plans | High |
| FR-SUB-004 | System processes initial payment on subscription creation | High |
| FR-SUB-005 | System auto-renews subscriptions at each billing cycle (monthly, quarterly, annual) | High |
| FR-SUB-006 | Customer can pause a subscription (no billing during pause) | High |
| FR-SUB-007 | Customer can resume a paused subscription | High |
| FR-SUB-008 | Customer can cancel a subscription (effective at end of current period) | High |
| FR-SUB-009 | System sends renewal reminder before billing date (e.g., 3 days before) | Medium |
| FR-SUB-010 | System retries failed renewal payments (up to 3 attempts over 7 days) | High |
| FR-SUB-011 | Subscription expires (auto-cancel) after repeated payment failures | High |
| FR-SUB-012 | Provider can view active subscribers and subscription analytics (MRR, churn, etc.) | High |
| FR-SUB-013 | Existing subscribers keep their current price when provider updates plan pricing | Medium |
| FR-SUB-014 | Platform commission applies to each subscription billing cycle | High |
| FR-SUB-015 | Customer and provider can view subscription billing history | High |

### 5.9 Search & Discovery

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SRCH-001 | Search services by keyword | High |
| FR-SRCH-002 | Filter by service category | High |
| FR-SRCH-003 | Filter by location/distance | High |
| FR-SRCH-004 | Filter by price range | Medium |
| FR-SRCH-005 | Filter by provider rating | Medium |
| FR-SRCH-006 | Filter by availability (same-day, specific date) | Medium |
| FR-SRCH-007 | Sort results by relevance, price, rating, distance | Medium |
| FR-SRCH-008 | Show featured/promoted providers | Low |

### 5.10 Ratings & Reviews

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-REV-001 | Customer can rate provider (1-5 stars) | High |
| FR-REV-002 | Customer can write text review | High |
| FR-REV-003 | Provider can rate customer | Medium |
| FR-REV-004 | Reviews are visible on provider profile | High |
| FR-REV-005 | Average rating calculated and displayed | High |
| FR-REV-006 | Reviews can only be submitted after task completion | High |
| FR-REV-007 | Provider can respond to reviews | Medium |

### 5.11 Verification & Trust

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-TRUST-001 | Phone number verification via OTP | High |
| FR-TRUST-002 | Email verification | High |
| FR-TRUST-003 | Individual provider identity document upload | High |
| FR-TRUST-004 | Admin review and approval of provider documents | High |
| FR-TRUST-005 | Organization verification (organization license/registration document) | High |
| FR-TRUST-006 | Admin review and approval of organization documents | High |
| FR-TRUST-007 | Display verification badges on provider and organization profiles | Medium |
| FR-TRUST-008 | Background check integration (future) | Low |

### 5.12 Admin Panel

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ADM-001 | Dashboard with key platform metrics | High |
| FR-ADM-002 | User management (view, approve, suspend, delete) | High |
| FR-ADM-003 | Organization management (view, approve, suspend) | High |
| FR-ADM-004 | Provider and organization verification workflow | High |
| FR-ADM-005 | Service category management | High |
| FR-ADM-005 | Booking management and monitoring | Medium |
| FR-ADM-006 | Dispute/issue management | Medium |
| FR-ADM-007 | Payment and payout management | High |
| FR-ADM-008 | Reports and analytics | Medium |
| FR-ADM-009 | Platform configuration (commission rates, policies) | Medium |
| FR-ADM-010 | Content management (FAQs, terms, etc.) | Low |
| FR-ADM-011 | Admin can review and approve/reject new services before they become visible | High |
| FR-ADM-012 | Admin can configure platform settings (commission rates, payment timeouts, default buffers) | High |

---

## 6. NON-FUNCTIONAL REQUIREMENTS

### 6.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-001 | Page load time | < 3 seconds |
| NFR-PERF-002 | API response time | < 500ms |
| NFR-PERF-003 | Search results returned | < 2 seconds |
| NFR-PERF-004 | Support concurrent users | 10,000 initial |
| NFR-PERF-005 | Mobile app startup time | < 2 seconds |

### 6.2 Scalability

| ID | Requirement |
|----|-------------|
| NFR-SCAL-001 | Architecture must support horizontal scaling |
| NFR-SCAL-002 | Database must handle growth to 1M+ users |
| NFR-SCAL-003 | Support for multiple regions/countries |
| NFR-SCAL-004 | CDN for static assets and images |

### 6.3 Security

| ID | Requirement |
|----|-------------|
| NFR-SEC-001 | All data transmitted over HTTPS/TLS |
| NFR-SEC-002 | Passwords hashed with strong algorithm (bcrypt) |
| NFR-SEC-003 | JWT tokens for API authentication |
| NFR-SEC-004 | Rate limiting on APIs to prevent abuse |
| NFR-SEC-005 | Input validation and sanitization |
| NFR-SEC-006 | PCI compliance for payment data |
| NFR-SEC-007 | GDPR/data protection compliance |
| NFR-SEC-008 | Regular security audits |

### 6.4 Availability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-AVAIL-001 | System uptime | 99.9% |
| NFR-AVAIL-002 | Scheduled maintenance windows | < 4 hours/month |
| NFR-AVAIL-003 | Disaster recovery plan | RTO < 4 hours |
| NFR-AVAIL-004 | Data backup frequency | Daily |

### 6.5 Usability

| ID | Requirement |
|----|-------------|
| NFR-USE-001 | Mobile-first responsive design |
| NFR-USE-002 | Support for Portuguese language (Mozambique) |
| NFR-USE-003 | Support for English language |
| NFR-USE-004 | Accessible design (WCAG 2.1 AA) |
| NFR-USE-005 | Offline capability for mobile (view cached data) |
| NFR-USE-006 | Low bandwidth optimization for 2G/3G networks |

### 6.6 Localization

| ID | Requirement |
|----|-------------|
| NFR-LOC-001 | Multi-currency support (MZN as default for Mozambique launch) |
| NFR-LOC-002 | Auto-detect timezone based on user location |
| NFR-LOC-003 | International phone format support (+258, +1, +44, etc.) |
| NFR-LOC-004 | Flexible address format for global locations |
| NFR-LOC-005 | Integration with maps (Google Maps, OpenStreetMap) |
| NFR-LOC-006 | Support for region-specific payment providers |
| NFR-LOC-007 | Locale-aware date, time, and number formatting |

---

## 7. USER STORIES

### 7.1 Customer Stories

```
US-C01: As a customer, I want to register an account so that I can book services.

US-C02: As a customer, I want to search for services by category so that I can find what I need.

US-C03: As a customer, I want to filter providers by location so that I can find someone nearby.

US-C04: As a customer, I want to view provider profiles with their packages and pricing so that I can choose the best one.

US-C05: As a customer, I want to book a fixed-price package directly so that I know exactly what I'll pay (Path A).

US-C06: As a customer, I want to book a provider by the hour so that I have flexibility for time-based services (Path B).

US-C07: As a customer, I want to request a custom quote from a specific provider so that I can get a personalized price for something not in their packages (Path C).

US-C08: As a customer, I want to see volume discounts applied when I book longer durations so that I get a better deal.

US-C09: As a customer, I want to post a task so that multiple providers can bid and I can choose the best offer (Path D).

US-C10: As a customer, I want to communicate with my provider so that I can clarify task details or negotiate a custom quote.

US-C11: As a customer, I want to pay securely through the app so that my money is protected in escrow.

US-C12: As a customer, I want to rate and review my provider so that others can benefit from my experience.

US-C13: As a customer, I want to view my booking history so that I can track past services.

US-C14: As a customer, I want to cancel a booking so that I can change my plans if needed.

US-C15: As a customer, I want to select an available time slot so that I can book at a convenient time.

US-C16: As a customer, I want to see whether I need to go to the provider or they come to me so that I know what to expect.

US-C17: As a customer, I want to book services from organizations (salons, workshops) so that I have more options.

US-C18: As a customer, I want to report a problem so that I can get help resolving issues.
```

### 7.2 Individual Provider Stories

```
US-P01: As a provider, I want to create a professional profile so that customers can find me.

US-P02: As a provider, I want to create fixed-price service packages so that customers can book with price certainty.

US-P03: As a provider, I want to set hourly rates for time-based services so that I have pricing flexibility.

US-P04: As a provider, I want to receive custom quote requests from customers so that I can offer personalized pricing.

US-P05: As a provider, I want to respond to quote requests with detailed breakdowns so that customers understand my pricing.

US-P06: As a provider, I want to configure volume discounts so that I can attract larger bookings.

US-P07: As a provider, I want to set recurring weekly availability so that my schedule is consistent.

US-P08: As a provider, I want to set buffer time between appointments so that I have time to rest or travel.

US-P09: As a provider, I want the system to auto-generate time slots so that customers can easily pick a time.

US-P10: As a provider, I want to browse posted tasks so that I can find work opportunities.

US-P11: As a provider, I want to submit bids on tasks so that I can win new customers.

US-P12: As a provider, I want to accept or decline bookings so that I can manage my workload.

US-P13: As a provider, I want to communicate with customers so that I can understand their needs and negotiate quotes.

US-P14: As a provider, I want to mark tasks as complete so that I can receive payment.

US-P15: As a provider, I want to view my earnings so that I can track my income.

US-P16: As a provider, I want to withdraw my earnings so that I can access my money.

US-P17: As a provider, I want to upload my ID documents so that I can become verified.

US-P18: As a provider, I want to respond to reviews so that I can address customer feedback.
```

### 7.3 Organization Owner Stories

```
US-B01: As an organization owner, I want to create an organization profile so that customers can find my establishment.

US-B02: As an organization owner, I want to set my organization address so that customers know where to come.

US-B03: As an organization owner, I want to set operating hours so that customers know when we're open.

US-B04: As an organization owner, I want to create services with fixed prices so that customers can book easily.

US-B05: As an organization owner, I want to set service duration and buffer time so that the system generates accurate time slots.

US-B06: As an organization owner, I want to add staff members so that multiple customers can be served simultaneously.

US-B07: As an organization owner, I want to assign services to specific staff so that bookings go to the right person.

US-B08: As an organization owner, I want staff to manage their own schedules within organization hours.

US-B09: As an organization owner, I want to view all organization bookings so that I can manage operations.

US-B10: As an organization owner, I want to respond to custom quote requests so that I can serve customers with non-standard needs.

US-B11: As an organization owner, I want to view organization earnings and analytics so that I can track performance.

US-B12: As an organization owner, I want to request payouts for organization earnings so that I can access the money.
```

### 7.4 Admin Stories

```
US-A01: As an admin, I want to view platform metrics so that I can monitor business health.

US-A02: As an admin, I want to verify provider documents so that I can ensure trust and safety.

US-A03: As an admin, I want to manage service categories so that I can organize the marketplace.

US-A04: As an admin, I want to handle disputes so that I can resolve customer issues.

US-A05: As an admin, I want to manage payouts so that I can ensure providers are paid.

US-A06: As an admin, I want to suspend users so that I can enforce platform policies.

US-A07: As an admin, I want to view reports so that I can make data-driven decisions.
```

---

## 8. DATA ENTITIES

### 8.1 Core Entities

```
USER (auth identity — passwords/sessions delegated to Better Auth)
├── id (UUID)
├── email
├── first_name
├── last_name
├── roles (JSON array: ["customer", "individual_provider", "organization_owner", "admin"])
├── email_verified
├── status (active, suspended, pending)
├── created_at
└── updated_at

PROFILE (unified — base fields + provider fields when upgraded)
├── id (UUID)
├── user_id (FK, unique)
├── phone_code_prefix, phone_number, phone_verified
├── profile_image_url
├── bio (nullable — set when user becomes provider)
├── service_areas (JSON, for at_customer services)
├── skills (JSON)
├── portfolio_images (JSON)
├── identity_document_url
├── verification_status (nullable: pending, verified, rejected)
├── verification_rejected_reason
├── average_rating, total_reviews, total_completed_tasks
├── created_at
└── updated_at

ORGANIZATION
├── id (UUID)
├── owner_id (FK → User)
├── name
├── description
├── logo_url
├── cover_photos (JSON)
├── address
├── address_lat
├── address_lng
├── phone
├── email
├── website (nullable)
├── organization_type (salon, workshop, restaurant, clinic, agency, other)
├── verification_status (pending, verified, rejected)
├── verification_document_url (organization license)
├── average_rating
├── total_reviews
├── total_completed_bookings
├── is_active
├── created_at
└── updated_at

ORGANIZATION_MEMBER
├── id (UUID)
├── organization_id (FK)
├── user_id (FK)
├── role (owner, manager, staff)
├── display_name
├── photo_url (nullable)
├── specialties (JSON, e.g., ["haircut", "beard"])
├── is_active
├── joined_at
└── updated_at

Note: Organization operating hours are represented by AVAILABILITY_RULE with
owner_type=organization and rule_type=weekly_recurring. No separate OPERATING_HOURS
entity is needed — the availability model handles both display hours and
slot generation scheduling.

SERVICE_CATEGORY
├── id (UUID)
├── name
├── description
├── icon_url
├── parent_category_id (FK, nullable)
├── is_active
├── sort_order
├── created_at
└── updated_at

SERVICE
├── id (UUID)
├── provider_type (individual, organization)
├── provider_id (FK → User, nullable)
├── organization_id (FK → Organization, nullable)
├── category_id (FK)
├── title
├── description
├── service_location_type (at_customer, at_provider, remote, flexible)
├── pricing_mode (package, hourly, quote)
├── hourly_rate (nullable, for hourly mode)
├── minimum_hours (nullable, for hourly mode, default 1)
├── duration_minutes (default service duration for slot generation)
├── buffer_minutes (rest/travel time between appointments)
├── accepts_custom_quotes (boolean)
├── status (draft, pending_approval, approved, published, rejected, unpublished, archived)
├── submitted_at (nullable)
├── approved_at (nullable)
├── rejected_at (nullable)
├── rejection_reason (nullable)
├── published_at (nullable)
├── created_at
└── updated_at

SERVICE_PACKAGE
├── id (UUID)
├── service_id (FK)
├── name (e.g., "Regular Cleaning T2", "Men's Haircut")
├── description
├── fixed_price
├── duration_minutes (overrides service default if set)
├── includes (JSON, e.g., ["materials", "equipment"])
├── variables (JSON, e.g., {"house_type": "T2", "rooms": 2})
├── is_active
├── sort_order
├── created_at
└── updated_at

QUOTE_REQUEST
├── id (UUID)
├── customer_id (FK)
├── provider_id (FK)
├── service_id (FK, nullable)
├── category_id (FK)
├── title
├── description
├── images (JSON)
├── preferred_date
├── preferred_time
├── duration_days (nullable, for multi-day requests)
├── location_address
├── location_lat
├── location_lng
├── status (pending, quoted, accepted, declined, expired, cancelled)
├── created_at
├── expires_at
└── updated_at

QUOTE_RESPONSE
├── id (UUID)
├── quote_request_id (FK)
├── provider_id (FK)
├── total_price
├── price_breakdown (JSON, e.g., [{"item": "Day 1-5 cooking", "unit_price": 4500, "quantity": 5, "subtotal": 22500}])
├── discount_applied (nullable)
├── discount_amount (nullable)
├── message
├── valid_until
├── status (pending, accepted, declined, expired)
├── created_at
└── updated_at

DISCOUNT_RULE
├── id (UUID)
├── provider_id (FK)
├── service_id (FK, nullable, null = applies to all services)
├── discount_type (hours_volume, days_volume, recurring, first_time)
├── threshold (e.g., 5 for "5+ hours")
├── discount_percentage
├── description (e.g., "10% off for 5+ hours")
├── is_active
├── created_at
└── updated_at

TASK_POST
├── id (UUID)
├── customer_id (FK)
├── category_id (FK)
├── title
├── description
├── location_address
├── location_lat
├── location_lng
├── preferred_date
├── preferred_time
├── budget_min
├── budget_max
├── images (JSON)
├── status (open, in_progress, completed, cancelled)
├── created_at
└── updated_at

BID
├── id (UUID)
├── task_id (FK)
├── provider_id (FK)
├── proposed_price
├── message
├── status (pending, accepted, rejected, withdrawn)
├── created_at
└── updated_at

BOOKING
├── id (UUID)
├── customer_id (FK)
├── provider_type (individual, organization)
├── provider_id (FK → User, nullable)
├── organization_id (FK → Organization, nullable)
├── staff_member_id (FK → OrganizationMember, nullable)
├── service_id (FK, nullable)
├── package_id (FK, nullable, for Path A)
├── task_id (FK, nullable, for Path D)
├── bid_id (FK, nullable, for Path D)
├── quote_response_id (FK, nullable, for Path C)
├── recurrence_id (FK → BookingRecurrence, nullable, links to recurring series)
├── booking_path (package, hourly, custom_quote, task_bid)
├── service_location (at_customer, at_provider, remote)
├── scheduled_date
├── scheduled_start_time
├── scheduled_end_time
├── estimated_duration_minutes
├── actual_duration_minutes (nullable, for hourly bookings)
├── location_address (customer's or provider's, depending on service_location)
├── location_lat
├── location_lng
├── description
├── base_amount
├── discount_amount (default 0)
├── total_amount
├── platform_fee
├── provider_earnings
├── tip_amount (default 0)
├── snapshot (JSON - captures service name, package details, slot time, pricing breakdown at booking time)
├── status (pending, pending_payment, confirmed, in_progress, completed, cancelled, disputed, expired)
├── started_at
├── completed_at
├── customer_confirmed_at
├── cancelled_at
├── cancellation_reason
├── payment_expires_at (nullable, deadline for payment completion)
├── created_at
└── updated_at

PAYMENT_INTENT
├── id (UUID)
├── booking_id (FK, nullable, for one-time/recurring booking payments)
├── subscription_billing_id (FK, nullable, for subscription payments)
├── payer_id (FK)
├── amount
├── currency
├── payment_method (mpesa, emola, card, bank)
├── payment_processor (mpesa, emola, stripe)
├── status (pending, processing, completed, failed, cancelled, expired)
├── expires_at (nullable)
├── metadata (JSON, nullable)
├── created_at
└── updated_at

PAYMENT_TRANSACTION
├── id (UUID)
├── payment_intent_id (FK)
├── processor_transaction_id (external reference)
├── amount
├── currency
├── status (pending, captured, failed, refunded, partially_refunded)
├── platform_fee (nullable)
├── provider_payout (nullable)
├── webhook_data (JSON, nullable)
├── paid_at (nullable)
├── failed_at (nullable)
├── refunded_at (nullable)
├── created_at
└── updated_at

BOOKING_RECURRENCE (recurring booking series)
├── id (UUID)
├── customer_id (FK)
├── provider_type (individual, organization)
├── provider_id (FK, nullable)
├── organization_id (FK, nullable)
├── service_id (FK)
├── package_id (FK, nullable)
├── frequency (weekly, biweekly, monthly)
├── day_of_week (nullable, 0-6 for weekly/biweekly)
├── day_of_month (nullable, 1-31 for monthly)
├── preferred_start_time
├── service_location (at_customer, at_provider, remote)
├── location_address (nullable)
├── location_lat (nullable)
├── location_lng (nullable)
├── total_occurrences (nullable, null = indefinite)
├── occurrences_created (count of bookings generated so far)
├── start_date
├── end_date (nullable)
├── status (active, paused, cancelled, completed)
├── auto_pay (boolean, default true)
├── created_at
└── updated_at

SUBSCRIPTION_PLAN (provider-defined subscription offerings)
├── id (UUID)
├── service_id (FK)
├── provider_type (individual, organization)
├── provider_id (FK, nullable)
├── organization_id (FK, nullable)
├── name (e.g., "Monthly Accounting Basic")
├── description
├── price (per billing cycle)
├── currency
├── billing_frequency (monthly, quarterly, annual)
├── includes (JSON, e.g., ["monthly statements", "tax filing", "2h consultation"])
├── max_subscribers (nullable, capacity limit)
├── is_active
├── sort_order
├── created_at
└── updated_at

SERVICE_SUBSCRIPTION (customer subscription to a plan)
├── id (UUID)
├── customer_id (FK)
├── subscription_plan_id (FK)
├── provider_type (individual, organization)
├── provider_id (FK, nullable)
├── organization_id (FK, nullable)
├── service_id (FK)
├── billing_frequency (monthly, quarterly, annual)
├── price_per_cycle (locked at subscription time)
├── current_period_start
├── current_period_end
├── next_billing_date
├── status (pending, active, paused, cancelled, expired)
├── started_at
├── paused_at (nullable)
├── resumed_at (nullable)
├── cancelled_at (nullable)
├── cancellation_reason (nullable)
├── created_at
└── updated_at

SUBSCRIPTION_BILLING (billing history per subscription)
├── id (UUID)
├── subscription_id (FK → ServiceSubscription)
├── payment_intent_id (FK → PaymentIntent, nullable)
├── billing_period_start
├── billing_period_end
├── amount
├── currency
├── platform_fee
├── provider_earnings
├── status (pending, paid, failed, refunded)
├── retry_count (default 0)
├── paid_at (nullable)
├── failed_at (nullable)
├── created_at
└── updated_at

PAYOUT
├── id (UUID)
├── provider_id (FK)
├── amount
├── currency
├── payout_method
├── payout_destination
├── status (pending, processing, completed, failed)
├── processed_at
├── created_at
└── updated_at

MESSAGE
├── id (UUID)
├── conversation_id
├── sender_id (FK)
├── receiver_id (FK)
├── booking_id (FK, nullable)
├── content
├── image_url (nullable)
├── is_read
├── created_at
└── updated_at

REVIEW
├── id (UUID)
├── booking_id (FK)
├── reviewer_id (FK)
├── reviewee_id (FK)
├── overall_rating (1-5)
├── punctuality_rating (1-5, nullable)
├── quality_rating (1-5, nullable)
├── communication_rating (1-5, nullable)
├── comment
├── response (nullable)
├── response_at (nullable)
├── created_at
└── updated_at

NOTIFICATION
├── id (UUID)
├── user_id (FK)
├── type
├── title
├── message
├── data (JSON)
├── is_read
├── created_at
└── updated_at

AVAILABILITY_RULE (flexible availability rules for individuals and organizations)
├── id (UUID)
├── owner_type (individual, organization, staff)
├── owner_id (FK → User, Organization, or OrganizationMember)
├── rule_type (weekly_recurring, date_range, one_time)
├── days_of_week (JSON array, e.g., [1,2,3,4,5] for Mon-Fri; for weekly_recurring)
├── start_date (nullable, for date_range rules)
├── end_date (nullable, for date_range rules)
├── date (nullable, for one_time rules)
├── effective_from (date)
├── effective_until (nullable, date)
├── is_active (boolean)
├── description (nullable, e.g., "Summer schedule")
├── created_at
└── updated_at

AVAILABILITY_TIME_WINDOW (multiple time windows per rule)
├── id (UUID)
├── availability_rule_id (FK → AvailabilityRule)
├── start_time (HH:mm format)
├── end_time (HH:mm format)
└── sort_order

AVAILABILITY_EXCEPTION (block or override specific dates)
├── id (UUID)
├── owner_type (individual, organization, staff)
├── owner_id (FK → User, Organization, or OrganizationMember)
├── exception_type (blocked, special)
├── date
├── reason (nullable, e.g., "Holiday", "Personal day")
├── created_at
└── updated_at

EXCEPTION_TIME_WINDOW (custom hours for SPECIAL exceptions)
├── id (UUID)
├── availability_exception_id (FK → AvailabilityException)
├── start_time (HH:mm format)
├── end_time (HH:mm format)
└── sort_order

SCHEDULING_CONFIG (per-owner scheduling settings)
├── id (UUID)
├── owner_type (individual, organization)
├── owner_id (FK → User or Organization)
├── advance_booking_days (default 30)
├── cutoff_hours (minimum hours before slot, default 2)
├── buffer_minutes (default rest/travel time, default 0)
├── timezone (nullable, auto-detect if not set)
├── created_at
└── updated_at

SLOT (persisted time slots for capacity tracking)
├── id (UUID)
├── owner_type (individual, organization)
├── owner_id (FK → User or Organization)
├── service_id (FK → Service, nullable)
├── start_date_time
├── end_date_time
├── capacity (1 for individual, N for organization based on staff)
├── booked_spots (default 0)
├── available_spots (= capacity - booked_spots)
├── source_type (rule, exception)
├── source_id (FK → AvailabilityRule or AvailabilityException)
├── created_at
└── updated_at

PLATFORM_SETTINGS
├── id (UUID)
├── commission_percentage (default platform commission rate)
├── default_payment_timeout_minutes (default 30)
├── default_cutoff_hours (default 2)
├── default_advance_booking_days (default 30)
├── default_cancellation_window_hours (default 24)
├── default_quote_expiration_hours (default 48)
├── default_task_expiration_days (default 7)
├── default_booking_acceptance_hours (default 24)
├── default_completion_confirmation_hours (default 24)
├── created_at
└── updated_at
```

---

## 9. INTEGRATIONS REQUIRED

| Integration | Purpose | Priority |
|-------------|---------|----------|
| M-Pesa API | Mobile money payments | High |
| e-Mola API | Mobile money payments | High |
| Stripe / Payment Gateway | Card payments | High |
| Firebase Cloud Messaging | Push notifications | High |
| Twilio / SMS Gateway | SMS notifications | Medium |
| SendGrid / Email Service | Email notifications | Medium |
| Google Maps API | Location services | High |
| AWS S3 / Cloud Storage | Image/file storage | High |
| Identity Verification Service | Provider verification | Medium |

---

## 10. ACCEPTANCE CRITERIA SUMMARY

### MVP (Minimum Viable Product) Scope
1. User registration and authentication
2. Individual provider profile creation with service packages
3. Organization/establishment creation with services and staff
4. Rule-based availability model (weekly recurring rules, multiple time windows/day, blocked exceptions)
5. Persisted slot capacity tracking with auto-generation from availability rules
6. Scheduling config (cutoff hours, advance booking days, buffer minutes, timezone)
7. Service lifecycle with admin approval (draft → pending_approval → approved → published)
8. Fixed-price package booking (Path A)
9. Hourly booking (Path B)
10. Custom quote request and response (Path C)
11. Task posting with bidding (Path D)
12. Booking lifecycle with pending_payment state and payment timeout
13. Booking snapshot (captures service/slot/pricing at booking time)
14. Service location types (at_customer, at_provider, remote, flexible)
15. Service catalog with categories and search
16. In-app messaging (including quote negotiation)
17. Payment intent pattern with M-Pesa integration and escrow
18. Basic ratings and reviews (overall + sub-ratings)
19. Basic volume discounts (hours/days)
20. Recurring bookings (weekly, biweekly, monthly) for Path A and B
21. Service subscriptions (monthly, quarterly, annual) with auto-billing
22. Subscription plans, subscriber management, billing history
23. Platform settings (commission, timeouts, defaults)
24. Mobile app (at least one platform)
25. Web application

### Post-MVP Features
- e-Mola integration
- Card payments
- Date-range and one-time availability rules (summer schedules, special events)
- Special date exceptions (custom hours override)
- Multi-staff concurrent slot management
- Staff-level availability rules
- First-time customer discounts
- Quarterly and annual subscription billing frequencies (MVP: monthly only)
- Advanced analytics for providers and organizations
- Background checks
- Multi-language support
- Multi-currency support for global expansion
- Provider-suggested packages based on category templates
- Organization verification with document upload
- Staff performance tracking and analytics
- Promo codes / promotional discounts
- Favorite providers/organizations lists

---

## 11. OPEN QUESTIONS

1. What is the platform commission percentage? *(configurable via PLATFORM_SETTINGS)*
2. What is the cancellation policy (timeframes, refund percentages)?
3. Minimum payout threshold for providers?
4. Should there be different user tiers (basic, premium)?
5. Will there be promotional features (featured providers, ads)?
6. Dispute resolution process and SLA?
7. Data retention policies?
8. Should hourly bookings have a maximum cap to protect customers from bill shock?
9. Should custom quotes require a deposit or full payment upfront?
10. Maximum discount percentage a provider can set for volume discounts?
11. Should the platform suggest package prices based on market averages for each category?
12. Should organizations be verified before they can accept bookings?
13. Maximum number of staff members per organization plan/tier?
14. Should the platform support video calls for remote services, or rely on external links?
15. Slot regeneration strategy: triggered on availability config change vs scheduled batch job?
16. Service approval SLA for admins (e.g., 24h to review new services)?
17. Should payment intent support partial payments or deposits for high-value bookings?
18. Should the snapshot include provider profile data (name, photo) or only service/pricing data?
19. Subscription cancellation policy: immediate or end-of-period? Allow mid-cycle refunds?
20. Maximum number of subscription plans per service?
21. Should recurring bookings allow auto-pay (charge automatically) or require manual payment each time?
22. How many bookings ahead should the system generate for recurring series (default: 4)?
23. Should subscription plans support a trial period (e.g., first month free)?

---

**Document Status:** Draft
**Next Steps:** Review and validate requirements with stakeholders
