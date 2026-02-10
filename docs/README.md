# Ntizo Documentation

**Version:** 3.1
**Platform:** Global Service Marketplace (Mozambique as initial launch)

---

## Core Documents

| Document | Description |
|----------|-------------|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | High-level requirements definition (v3.1) |
| [SRS-ISO29148.md](./SRS-ISO29148.md) | Formal SRS following ISO/IEC/IEEE 29148:2018 (v3.1) |
| [SRS-ISO29148.pdf](./SRS-ISO29148.pdf) | PDF export of the SRS |

## Architecture

| Document | Description |
|----------|-------------|
| [Context Map](./architecture/context-map.md) | BC relationships, event flows, integration patterns |
| [Tech Stack](./architecture/tech-stack.md) | Technology decisions and rationale |

## Bounded Contexts

Each document provides deep, implementable detail: aggregates, entities, value objects, domain events, use cases, repository ports, entity schemas, business rules, and cross-context dependencies.

| # | Bounded Context | Document | Key Aggregates |
|---|----------------|----------|----------------|
| 1 | **User** | [01-user.md](./bounded-contexts/01-user.md) | Address (shared), User, Profile, Organization, OrganizationMember |
| 2 | **Catalog** | [02-catalog.md](./bounded-contexts/02-catalog.md) | ServiceCategory, Service, ServicePackage |
| 3 | **Scheduling** | [03-scheduling.md](./bounded-contexts/03-scheduling.md) | AvailabilityRule, AvailabilityException, Slot, SchedulingConfig |
| 4 | **Pricing** | [04-pricing.md](./bounded-contexts/04-pricing.md) | QuoteRequest, QuoteResponse, DiscountRule |
| 5 | **Booking** | [05-booking.md](./bounded-contexts/05-booking.md) | Booking, BookingRecurrence, TaskPost, Bid, SubscriptionPlan, ServiceSubscription |
| 6 | **Payment** | [06-payment.md](./bounded-contexts/06-payment.md) | PaymentIntent, PaymentTransaction, Payout |
| 7 | **Communication** | [07-communication.md](./bounded-contexts/07-communication.md) | Conversation, Message, Notification |
| 8 | **Review** | [08-review.md](./bounded-contexts/08-review.md) | Review |

## Field Research

| Document | Description |
|----------|-------------|
| [Documento de Pesquisa de Campo.docx](./field-research/Documento%20de%20Pesquisa%20de%20Campo.docx) | Field research document (Portuguese) |
| [Documento de Pesquisa de Campo.pdf](./field-research/Documento%20de%20Pesquisa%20de%20Campo.pdf) | PDF export |
| [OSCAR](www.oscar-app.com) | Exemplo da aplicação|

## Reading Order

1. Start with **REQUIREMENTS.md** for the high-level overview
2. Read **architecture/context-map.md** to understand BC relationships
3. Read BC docs in order (01 through 08) - they follow dependency order
4. Reference **SRS-ISO29148.md** for formal requirements traceability
5. See **architecture/tech-stack.md** for implementation technology decisions
