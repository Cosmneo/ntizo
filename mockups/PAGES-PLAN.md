# Ntizo — Page Mockups Plan

> Complete map of all pages/screens needed, organized by actor.
> Derived from REQUIREMENTS.md v3.1 (all FRs, user stories, and data entities).
> Each page references the FRs it fulfills.

---

## Folder Structure

```
mockups/pages/
├── public/                    # No auth required
├── auth/                      # Authentication flows
├── customer/                  # Customer-facing pages
├── provider/                  # Individual provider pages
├── organization/              # Organization owner/manager pages
├── staff/                     # Organization staff pages
├── admin/                     # Admin panel pages
└── shared/                    # Reusable components/layouts
```

---

## 1. PUBLIC PAGES (No Auth)

Pages accessible to anyone, including non-logged-in visitors.

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 1.1 | **Landing Page** | `public/landing.html` | Hero + search, categories, how it works, featured providers, social proof, CTA | FR-SRCH-001 |
| 1.2 | **Browse Categories** | `public/categories.html` | Grid of all service categories with icons, counts, subcategories | FR-CUST-002, FR-SRCH-002 |
| 1.3 | **Search Results** | `public/search-results.html` | List/map view of providers & services. Filters: category, location, price, rating, availability, sort | FR-CUST-003, FR-SRCH-001→007 |
| 1.4 | **Service Detail** | `public/service-detail.html` | Single service page: packages, hourly rate, reviews, provider info, booking CTA, location type badge | FR-CUST-004, FR-CUST-005→007 |
| 1.5 | **Provider Profile** | `public/provider-profile.html` | Individual provider: bio, portfolio, services, packages, reviews, rating, verification badge | FR-CUST-004, FR-REV-004→005 |
| 1.6 | **Organization Profile** | `public/organization-profile.html` | Organization: cover, logo, description, address/map, operating hours, team, services, reviews | FR-CUST-004, FR-CUST-017 |
| 1.7 | **Task Board** | `public/task-board.html` | Public listing of open tasks for providers to discover (preview; login required to bid) | FR-CUST-010 |
| 1.8 | **How It Works** | `public/how-it-works.html` | Detailed explanation of the 4 booking paths, for customers and providers | -- |
| 1.9 | **Become a Provider** | `public/become-provider.html` | Marketing page for provider sign-up: benefits, steps, CTA | -- |

**Total: 9 pages**

---

## 2. AUTH PAGES

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 2.1 | **Register** | `auth/register.html` | Email/phone/social sign-up. Choose initial role (customer vs provider) | FR-AUTH-001 |
| 2.2 | **Login** | `auth/login.html` | Email/phone + password. Social login buttons | FR-AUTH-002 |
| 2.3 | **Forgot Password** | `auth/forgot-password.html` | Email or SMS reset request | FR-AUTH-003 |
| 2.4 | **Reset Password** | `auth/reset-password.html` | New password form (from reset link) | FR-AUTH-003 |
| 2.5 | **OTP Verification** | `auth/otp-verify.html` | 6-digit code input for phone verification | FR-AUTH-004, FR-TRUST-001 |
| 2.6 | **Email Verification** | `auth/email-verify.html` | Email verified confirmation / resend link | FR-TRUST-002 |

**Total: 6 pages**

---

## 3. CUSTOMER PAGES

All pages after login, for users in customer mode.

### 3.1 Dashboard & Profile

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 3.1.1 | **Customer Dashboard** | `customer/dashboard.html` | Overview: upcoming bookings, active subscriptions, recent activity, quick actions | FR-CUST-020 |
| 3.1.2 | **Customer Profile** | `customer/profile.html` | Edit name, phone, photo, addresses, notification preferences | FR-CUST-001 |
| 3.1.3 | **Saved Providers** | `customer/favorites.html` | List of favorited providers and organizations | FR-CUST-021 |

### 3.2 Booking Flows (4 Paths)

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 3.2.1 | **Book Package (Path A)** | `customer/book-package.html` | Select package → pick slot from calendar → choose location (if flexible) → confirm → pay | FR-CUST-005, FR-CUST-012, FR-CUST-015 |
| 3.2.2 | **Book Hourly (Path B)** | `customer/book-hourly.html` | Set hours → pick slot from calendar → choose location → see estimated total with discounts → confirm → pay | FR-CUST-006, FR-CUST-012, FR-CUST-017 |
| 3.2.3 | **Request Quote (Path C)** | `customer/request-quote.html` | Describe need + images + preferred date/time + location → submit to specific provider | FR-CUST-007, FR-CUST-016 |
| 3.2.4 | **View Quote** | `customer/view-quote.html` | See provider's quote response: price breakdown, discounts, message, valid until. Accept/decline/negotiate via chat | FR-CUST-008, FR-CUST-009 |
| 3.2.5 | **Post Task (Path D)** | `customer/post-task.html` | Title, description, images, category, location, preferred date, budget range → post publicly | FR-CUST-010, FR-CUST-016 |
| 3.2.6 | **View Bids** | `customer/view-bids.html` | List of provider bids on a task: price, message, provider rating. Accept one | FR-CUST-011 |
| 3.2.7 | **Slot Picker** | `customer/slot-picker.html` | Calendar component: pick date → see available time slots → select | FR-CUST-012 |
| 3.2.8 | **Booking Checkout** | `customer/checkout.html` | Summary: service, slot, location, price breakdown (base + discount + fee), payment method selection, confirm | FR-PAY-001→003, FR-CUST-017 |
| 3.2.9 | **Payment Processing** | `customer/payment-processing.html` | Loading/processing state while payment intent processes. M-Pesa: USSD prompt. Card: form | FR-PAY-013 |
| 3.2.10 | **Booking Confirmation** | `customer/booking-confirmed.html` | Success: booking details, provider contact, add to calendar, what's next | FR-BOOK-006 |

### 3.3 Recurring & Subscriptions

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 3.3.1 | **Setup Recurring Booking** | `customer/setup-recurring.html` | Choose frequency (weekly/biweekly/monthly), day, time, auto-pay toggle → see recurring discount applied | FR-CUST-023, FR-BOOK-010 |
| 3.3.2 | **Manage Recurring** | `customer/manage-recurring.html` | View series: upcoming occurrences, skip/cancel individual, cancel series | FR-CUST-024, FR-CUST-025 |
| 3.3.3 | **Browse Subscription Plans** | `customer/subscription-plans.html` | List of subscription plans for a service: name, price, frequency, includes → subscribe CTA | FR-SUB-003, FR-CUST-026 |
| 3.3.4 | **My Subscriptions** | `customer/my-subscriptions.html` | Active/paused/cancelled subs: plan details, next billing, pause/resume/cancel buttons, billing history | FR-CUST-027→029 |

### 3.4 Booking Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 3.4.1 | **My Bookings** | `customer/my-bookings.html` | Tabs: Upcoming, In Progress, Completed, Cancelled. Cards with status, date, provider, amount | FR-CUST-020 |
| 3.4.2 | **Booking Detail** | `customer/booking-detail.html` | Full booking info: snapshot, status timeline, provider, location/map, payment, cancel button, chat link | FR-CUST-018, FR-BOOK-005 |
| 3.4.3 | **Confirm Completion** | `customer/confirm-completion.html` | Provider marked as done → confirm or dispute within 24h | FR-BOOK-012 |
| 3.4.4 | **My Tasks** | `customer/my-tasks.html` | Posted tasks: status, bid count, view bids | FR-CUST-010 |
| 3.4.5 | **My Quotes** | `customer/my-quotes.html` | Sent quote requests: status (pending/quoted/accepted/declined/expired) | FR-CUST-007→008 |

### 3.5 Communication

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 3.5.1 | **Messages List** | `customer/messages.html` | List of conversations with providers, last message preview, unread badge | FR-COMM-001 |
| 3.5.2 | **Chat** | `customer/chat.html` | Real-time chat: text + images. Quote negotiation inline. Booking context in header | FR-COMM-001, FR-COMM-006→007 |

### 3.6 Reviews & Payments

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 3.6.1 | **Submit Review** | `customer/submit-review.html` | After completed booking: 1-5 stars overall + sub-ratings + text (500 chars) | FR-CUST-019, FR-REV-001→002, FR-REV-006 |
| 3.6.2 | **Transaction History** | `customer/transactions.html` | All payments: date, service, amount, method, status, receipt download | FR-PAY-011→012 |
| 3.6.3 | **Report Issue** | `customer/report-issue.html` | Report a booking problem: reason, description, evidence | FR-CUST-022 |

### 3.7 Notifications

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 3.7.1 | **Notifications** | `customer/notifications.html` | All notifications: booking updates, messages, reviews, payments | FR-COMM-002→004 |

**Customer Total: 27 pages**

---

## 4. INDIVIDUAL PROVIDER PAGES

Pages for users in individual provider mode. Provider can switch to/from customer mode (FR-AUTH-005).

### 4.1 Onboarding & Profile

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 4.1.1 | **Provider Onboarding** | `provider/onboarding.html` | Multi-step: bio, categories, service area, portfolio photos, ID document upload | FR-PROV-001→003, FR-PROV-028, FR-TRUST-003 |
| 4.1.2 | **Provider Dashboard** | `provider/dashboard.html` | Overview: today's bookings, pending requests, earnings summary, quick stats, rating | FR-PROV-024 |
| 4.1.3 | **Provider Profile Editor** | `provider/profile-edit.html` | Edit bio, skills, portfolio, service areas, certifications, busy/unavailable toggle | FR-PROV-001→002, FR-PROV-027→028 |
| 4.1.4 | **Verification Status** | `provider/verification.html` | Document upload status, verification progress, re-upload if rejected | FR-TRUST-003→004 |

### 4.2 Service Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 4.2.1 | **My Services** | `provider/my-services.html` | List of services with status badges (draft/pending/approved/published). Create new CTA | FR-PROV-029 |
| 4.2.2 | **Create/Edit Service** | `provider/service-form.html` | Title, description, category, location type, pricing mode, duration, buffer, accepts quotes toggle | FR-PROV-004→008, FR-PROV-013→014 |
| 4.2.3 | **Manage Packages** | `provider/manage-packages.html` | CRUD packages for a service: name, price, duration, includes, variables | FR-PROV-004 |
| 4.2.4 | **Manage Discounts** | `provider/manage-discounts.html` | Configure discount rules per service: type, threshold, percentage | FR-PROV-011 |
| 4.2.5 | **Manage Subscription Plans** | `provider/manage-subscriptions.html` | CRUD subscription plans: name, price, frequency, includes, max subscribers, activate/deactivate | FR-PROV-032→033 |

### 4.3 Availability & Scheduling

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 4.3.1 | **Availability Settings** | `provider/availability.html` | Weekly recurring schedule (multi-window/day), date range rules, one-time rules. Visual calendar preview | FR-PROV-012, FR-PROV-030→031 |
| 4.3.2 | **Date Exceptions** | `provider/exceptions.html` | Block dates (holidays) or set special hours. Calendar with marked dates | FR-PROV-016 |
| 4.3.3 | **Scheduling Config** | `provider/scheduling-config.html` | Buffer time, cutoff hours, advance booking days, auto-accept toggle | FR-PROV-014, FR-PROV-017→019 |
| 4.3.4 | **Calendar View** | `provider/calendar.html` | Visual week/month calendar showing generated slots, booked appointments, blocked dates | FR-PROV-015 |

### 4.4 Booking Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 4.4.1 | **Incoming Bookings** | `provider/incoming-bookings.html` | Pending bookings requiring accept/decline. 24h countdown timer | FR-PROV-022, FR-BOOK-011 |
| 4.4.2 | **My Bookings** | `provider/my-bookings.html` | Tabs: Today, Upcoming, In Progress, Completed, Cancelled. Filter by booking path | FR-PROV-023 |
| 4.4.3 | **Booking Detail (Provider)** | `provider/booking-detail.html` | Full booking info: customer, service, snapshot, status actions (accept/start/complete), location/map | FR-PROV-022→023 |
| 4.4.4 | **Manage Recurring Bookings** | `provider/recurring-bookings.html` | Active recurring series from customers: view schedule, handle occurrences | FR-PROV-035 |
| 4.4.5 | **Subscriber List** | `provider/subscribers.html` | Active subscribers per plan: customer, start date, next billing, status | FR-PROV-034 |

### 4.5 Quotes & Tasks

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 4.5.1 | **Quote Requests** | `provider/quote-requests.html` | Incoming quote requests: customer, description, images, preferred date. Respond/decline | FR-PROV-009 |
| 4.5.2 | **Respond to Quote** | `provider/respond-quote.html` | Price breakdown builder: line items, discount, total, message, validity period | FR-PROV-009→010 |
| 4.5.3 | **Browse Tasks** | `provider/browse-tasks.html` | Open tasks matching provider categories: title, budget, location, date | FR-PROV-020 |
| 4.5.4 | **Submit Bid** | `provider/submit-bid.html` | Propose price + message for a task | FR-PROV-021 |
| 4.5.5 | **My Bids** | `provider/my-bids.html` | Submitted bids: status (pending/accepted/rejected/withdrawn) | FR-PROV-021 |

### 4.6 Earnings & Payments

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 4.6.1 | **Earnings Dashboard** | `provider/earnings.html` | Pending balance, available balance, total earned, chart over time, recent transactions | FR-PROV-024, FR-PAY-007 |
| 4.6.2 | **Request Payout** | `provider/request-payout.html` | Select amount, payout method (M-Pesa/bank), destination | FR-PROV-025, FR-PAY-008 |
| 4.6.3 | **Payout History** | `provider/payout-history.html` | Past payouts: amount, method, status, date | FR-PAY-008 |
| 4.6.4 | **Subscription Analytics** | `provider/subscription-analytics.html` | MRR, active subs, churn rate, billing history chart | FR-PROV-034, FR-SUB-012 |

### 4.7 Reviews & Communication

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 4.7.1 | **My Reviews** | `provider/my-reviews.html` | Reviews received: rating, text, respond button. Average rating + breakdown | FR-PROV-026, FR-REV-004→005, FR-REV-007 |
| 4.7.2 | **Messages** | `provider/messages.html` | Conversations with customers (same as customer chat, provider context) | FR-COMM-001 |
| 4.7.3 | **Notifications** | `provider/notifications.html` | Provider notifications: new bookings, quotes, payments, reviews | FR-COMM-002→004 |

**Provider Total: 29 pages**

---

## 5. ORGANIZATION PAGES (Owner/Manager)

Pages for organization owners and managers.

### 5.1 Organization Setup & Profile

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 5.1.1 | **Create Organization** | `organization/create.html` | Multi-step: name, type, description, logo, cover photos, address/GPS, phone, email, website | FR-BIZ-001→003 |
| 5.1.2 | **Organization Dashboard** | `organization/dashboard.html` | Overview: today's bookings across staff, revenue, upcoming appointments, pending actions | FR-BIZ-021 |
| 5.1.3 | **Organization Settings** | `organization/settings.html` | Edit profile, address/map, contact, verification doc upload | FR-BIZ-002→003, FR-TRUST-005 |
| 5.1.4 | **My Organizations** | `organization/list.html` | List of owned organizations (user can own multiple). Switch between them | FR-BIZ-001 |
| 5.1.5 | **Verification** | `organization/verification.html` | Organization license upload, verification status and progress | FR-TRUST-005→006 |

### 5.2 Team Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 5.2.1 | **Team Members** | `organization/team.html` | List of staff: name, role, photo, specialties, active/inactive. Invite new member | FR-BIZ-014→015 |
| 5.2.2 | **Invite Member** | `organization/invite-member.html` | Invite by email or phone, assign role (manager/staff), assign services | FR-BIZ-014→016 |
| 5.2.3 | **Member Detail** | `organization/member-detail.html` | Member profile, assigned services, personal schedule, performance metrics | FR-BIZ-016→017 |

### 5.3 Service Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 5.3.1 | **Organization Services** | `organization/services.html` | List services under this org with status badges. Create new CTA | FR-BIZ-006→007, FR-BIZ-027 |
| 5.3.2 | **Create/Edit Service** | `organization/service-form.html` | Same as provider but with org context: assign to staff, location type includes at_provider | FR-BIZ-007→012 |
| 5.3.3 | **Manage Packages** | `organization/packages.html` | CRUD packages for org services | FR-BIZ-008 |
| 5.3.4 | **Manage Discounts** | `organization/discounts.html` | Discount rules for org services | FR-BIZ-019 |
| 5.3.5 | **Manage Subscription Plans** | `organization/subscriptions.html` | CRUD subscription plans for org services | FR-BIZ-030→031 |

### 5.4 Scheduling

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 5.4.1 | **Operating Hours** | `organization/operating-hours.html` | Set org hours per day (multi-window), holidays/closures, special dates | FR-BIZ-004→005, FR-BIZ-028→029 |
| 5.4.2 | **Scheduling Config** | `organization/scheduling-config.html` | Buffer time, cutoff, advance booking, auto-accept | FR-BIZ-012, FR-BIZ-025→026 |
| 5.4.3 | **Staff Schedules** | `organization/staff-schedules.html` | View all staff schedules overlaid. Visual grid: staff × time | FR-BIZ-017 |
| 5.4.4 | **Organization Calendar** | `organization/calendar.html` | Master calendar: all bookings across all staff, filter by staff member | FR-BIZ-023 |

### 5.5 Bookings

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 5.5.1 | **All Bookings** | `organization/bookings.html` | All org bookings: filter by staff, status, date, booking path. Assign/reassign staff | FR-BIZ-023 |
| 5.5.2 | **Booking Detail** | `organization/booking-detail.html` | Full booking with staff assignment, status actions, customer info | FR-BIZ-023 |
| 5.5.3 | **Quote Requests** | `organization/quote-requests.html` | Incoming quotes for org services. Assign to staff to respond | FR-BIZ-020 |
| 5.5.4 | **Recurring Bookings** | `organization/recurring.html` | Active recurring series: customer, service, staff, schedule | FR-BIZ-032 |
| 5.5.5 | **Subscribers** | `organization/subscribers.html` | Active subscribers per plan: customer, plan, billing, status | FR-BIZ-031 |

### 5.6 Earnings & Analytics

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 5.6.1 | **Organization Earnings** | `organization/earnings.html` | Revenue dashboard: pending/available balance, by service, by staff, over time | FR-BIZ-021 |
| 5.6.2 | **Request Payout** | `organization/payout.html` | Payout request for org earnings | FR-BIZ-022 |
| 5.6.3 | **Analytics** | `organization/analytics.html` | Bookings, revenue, top services, staff performance, ratings, occupancy rate | FR-BIZ-021 |

### 5.7 Reviews & Communication

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 5.7.1 | **Organization Reviews** | `organization/reviews.html` | Reviews for org: rating breakdown, respond to reviews | FR-REV-004→005, FR-REV-007 |
| 5.7.2 | **Messages** | `organization/messages.html` | Customer conversations (can be assigned to staff) | FR-COMM-001 |

**Organization Total: 27 pages**

---

## 6. STAFF PAGES

Simplified pages for organization staff members.

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 6.1 | **Staff Dashboard** | `staff/dashboard.html` | Today's bookings, upcoming this week, personal stats | FR-BIZ-024 |
| 6.2 | **My Schedule** | `staff/schedule.html` | Personal schedule within org hours. Set/edit own availability windows | FR-BIZ-017 |
| 6.3 | **My Bookings** | `staff/my-bookings.html` | Assigned bookings: filter by status. Mark start/complete actions | FR-BIZ-024 |
| 6.4 | **Booking Detail** | `staff/booking-detail.html` | Booking info, customer contact, start/complete actions, chat | FR-BIZ-024 |
| 6.5 | **Messages** | `staff/messages.html` | Chat with customers for assigned bookings only | FR-COMM-001 |
| 6.6 | **Notifications** | `staff/notifications.html` | Booking assignments, schedule changes, customer messages | FR-COMM-002 |

**Staff Total: 6 pages**

---

## 7. ADMIN PAGES

Internal admin panel (Next.js web only, no mobile).

### 7.1 Dashboard & Overview

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 7.1.1 | **Admin Dashboard** | `admin/dashboard.html` | Platform KPIs: users, bookings, revenue, active providers/orgs, pending actions | FR-ADM-001 |

### 7.2 User Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 7.2.1 | **Users List** | `admin/users.html` | Table: name, email, roles, status, joined date. Search/filter. Actions: view, suspend, delete | FR-ADM-002 |
| 7.2.2 | **User Detail** | `admin/user-detail.html` | Full profile, bookings, reviews, transactions, verification docs, actions (approve/suspend) | FR-ADM-002 |
| 7.2.3 | **Provider Verification Queue** | `admin/verification-queue.html` | Pending provider docs: ID photo, review + approve/reject with reason | FR-ADM-004, FR-TRUST-003→004 |

### 7.3 Organization Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 7.3.1 | **Organizations List** | `admin/organizations.html` | Table: name, type, owner, status, rating. Actions: view, approve, suspend | FR-ADM-003 |
| 7.3.2 | **Organization Detail** | `admin/organization-detail.html` | Full org info, staff, services, bookings, earnings. Approve/suspend actions | FR-ADM-003 |
| 7.3.3 | **Organization Verification Queue** | `admin/org-verification.html` | Pending org docs: license, registration. Approve/reject | FR-TRUST-005→006 |

### 7.4 Service & Category Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 7.4.1 | **Categories Manager** | `admin/categories.html` | Tree view: parent/child categories. CRUD, reorder, activate/deactivate | FR-ADM-005 |
| 7.4.2 | **Service Approval Queue** | `admin/service-approval.html` | Pending services: title, provider, category, description. Approve/reject with reason | FR-ADM-011 |
| 7.4.3 | **Services List** | `admin/services.html` | All services: filter by status, category, provider type. Bulk actions | FR-ADM-011 |

### 7.5 Booking & Dispute Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 7.5.1 | **Bookings Monitor** | `admin/bookings.html` | All bookings: filter by status, path, provider type, date range | FR-ADM-005 (booking mgmt) |
| 7.5.2 | **Disputes** | `admin/disputes.html` | Open disputes: booking, customer, provider, reason. Resolution actions | FR-ADM-006 |
| 7.5.3 | **Dispute Detail** | `admin/dispute-detail.html` | Full dispute: booking snapshot, chat history, both parties' claims, resolution form | FR-ADM-006 |

### 7.6 Review Moderation

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 7.6.1 | **Reported Reviews** | `admin/reported-reviews.html` | Pending review reports: review content, reporter, reason. Dismiss/uphold | -- (from Review BC) |

### 7.7 Payment Management

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 7.7.1 | **Payments Overview** | `admin/payments.html` | All payment intents: filter by status, method, date. Transaction amounts | FR-ADM-007 |
| 7.7.2 | **Payout Management** | `admin/payouts.html` | Pending/completed payouts: provider, amount, method, status. Process/approve | FR-ADM-007 |

### 7.8 Analytics & Config

| # | Page | File | Description | FRs |
|---|------|------|-------------|-----|
| 7.8.1 | **Analytics** | `admin/analytics.html` | Charts: revenue over time, bookings by path, top categories, user growth, retention | FR-ADM-008 |
| 7.8.2 | **Platform Settings** | `admin/settings.html` | Commission %, payment timeouts, default buffers, cancellation policy, quote/task expiration | FR-ADM-009, FR-ADM-012 |
| 7.8.3 | **Content Management** | `admin/content.html` | FAQs, terms of service, privacy policy editor | FR-ADM-010 |

**Admin Total: 19 pages**

---

## 8. SHARED COMPONENTS

Reusable UI components used across multiple pages.

| # | Component | File | Used In |
|---|-----------|------|---------|
| 8.1 | **Navbar (Public)** | `shared/navbar-public.html` | All public pages |
| 8.2 | **Navbar (Logged In)** | `shared/navbar-auth.html` | All auth'd pages (with role switch) |
| 8.3 | **Sidebar (Provider)** | `shared/sidebar-provider.html` | All provider pages |
| 8.4 | **Sidebar (Organization)** | `shared/sidebar-org.html` | All organization pages |
| 8.5 | **Sidebar (Admin)** | `shared/sidebar-admin.html` | All admin pages |
| 8.6 | **Slot Picker Calendar** | `shared/slot-picker.html` | Booking flows (customer), calendar views |
| 8.7 | **Payment Method Selector** | `shared/payment-method.html` | Checkout, payout |
| 8.8 | **Review Card** | `shared/review-card.html` | Provider profile, org profile, reviews pages |
| 8.9 | **Provider Card** | `shared/provider-card.html` | Search results, landing, favorites |
| 8.10 | **Service Card** | `shared/service-card.html` | Search results, category browse, provider profile |
| 8.11 | **Booking Status Badge** | `shared/booking-badge.html` | All booking lists |
| 8.12 | **Map Component** | `shared/map.html` | Service detail, booking detail, search results |
| 8.13 | **Chat Widget** | `shared/chat.html` | All chat pages |
| 8.14 | **Notification Bell** | `shared/notification-bell.html` | All navbars |
| 8.15 | **Empty State** | `shared/empty-state.html` | All list pages when empty |
| 8.16 | **Mode Switcher** | `shared/mode-switcher.html` | Navbar — switch between Customer/Provider modes |

**Shared Components: 16**

---

## Summary

| Section | Pages |
|---------|-------|
| Public | 9 |
| Auth | 6 |
| Customer | 27 |
| Provider | 29 |
| Organization | 27 |
| Staff | 6 |
| Admin | 19 |
| Shared Components | 16 |
| **Total** | **139** |

---

## Mockup Priority Order

Build mockups in this order to progressively cover the most critical flows:

### Phase 1 — Core Public & Auth (15 pages)
1. Landing Page ✅ (done)
2. Register
3. Login
4. Browse Categories
5. Search Results
6. Provider Profile
7. Organization Profile
8. Service Detail
9. OTP Verification
10. Forgot/Reset Password
11. Email Verification
12. How It Works
13. Become a Provider
14. Task Board

### Phase 2 — Customer Booking Flows (17 pages)
15. Customer Dashboard
16. Book Package (Path A) + Slot Picker
17. Book Hourly (Path B)
18. Checkout + Payment Processing + Booking Confirmation
19. Request Quote (Path C) + View Quote
20. Post Task (Path D) + View Bids
21. My Bookings + Booking Detail
22. Confirm Completion
23. Submit Review
24. Messages + Chat
25. Setup Recurring + Manage Recurring
26. Browse Subscription Plans + My Subscriptions
27. Customer Profile + Favorites
28. Transaction History + Notifications

### Phase 3 — Provider Pages (29 pages)
29. Provider Onboarding
30. Provider Dashboard
31. My Services + Create/Edit Service
32. Manage Packages + Discounts + Subscription Plans
33. Availability Settings + Exceptions + Config + Calendar
34. Incoming Bookings + My Bookings + Booking Detail
35. Quote Requests + Respond to Quote
36. Browse Tasks + Submit Bid + My Bids
37. Earnings + Payout + Analytics
38. Reviews + Messages + Notifications

### Phase 4 — Organization Pages (27 pages)
39. Create Organization + Settings + My Organizations
40. Organization Dashboard
41. Team Members + Invite + Member Detail
42. Services + Packages + Discounts + Subscription Plans
43. Operating Hours + Scheduling Config + Staff Schedules + Calendar
44. All Bookings + Booking Detail + Quote Requests
45. Recurring + Subscribers
46. Earnings + Payout + Analytics
47. Reviews + Messages

### Phase 5 — Staff & Admin (25 pages)
48. Staff Dashboard + Schedule + Bookings
49. Admin Dashboard
50. Users + User Detail + Verification Queue
51. Organizations + Org Detail + Org Verification
52. Categories + Service Approval + Services List
53. Bookings Monitor + Disputes + Dispute Detail
54. Reported Reviews
55. Payments + Payouts
56. Analytics + Settings + Content
