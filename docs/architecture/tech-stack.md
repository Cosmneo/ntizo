# Technology Stack

## Runtime & Build

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Bun** | Runtime & package manager | Fast, TypeScript-native, built-in test runner, ~3x faster than Node.js for startup |
| **Turborepo** | Monorepo orchestration | Build caching, parallel execution, dependency-aware task ordering |
| **TypeScript** | Language | Type safety across all layers, shared types between packages |

## Architecture & Patterns

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **onion-lasagna** | DDD building blocks | Entity, Value Object, Aggregate, Domain Event, Repository Port primitives |
| **Hexagonal Architecture** | Code organization | Clean separation of domain, application, infrastructure; testable core |
| **Zod** | Runtime validation | Schema validation at API boundaries, type inference for TypeScript |

## Backend

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Hono** | API framework | Lightweight (~14KB), edge-compatible, middleware ecosystem, OpenAPI support |
| **Better Auth** | Authentication | Full-featured TypeScript auth: email/phone, social login, OTP, sessions, RBAC |
| **Drizzle ORM** | Database access | Type-safe SQL, zero overhead, excellent PostgreSQL support, migration tooling |
| **Neon PostgreSQL** | Primary database | Serverless PostgreSQL, auto-scaling, branching for dev/preview, connection pooling |

## Frontend

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **React Native** | Mobile apps (iOS & Android) | Cross-platform from single codebase, large ecosystem |
| **Next.js** | Web application | SSR/SSG, React ecosystem, API routes, image optimization |
| **TanStack Query** | Server state management | Caching, background refetch, optimistic updates, pagination |

## Infrastructure

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Vercel / Cloudflare** | Deployment | Serverless, edge-first, zero config, preview deployments |
| **Upstash Redis** | Caching & rate limiting | Serverless Redis, HTTP-based, global replication |
| **Inngest / QStash** | Background jobs & queues | Serverless job processing: slot generation, payment retries, subscription renewals, notifications |
| **Cloudflare R2 / AWS S3** | Object storage | Images, documents, portfolio files |

## Payments

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **M-Pesa API** | Mobile money (Mozambique) | Primary payment method for Mozambique market |
| **e-Mola API** | Mobile money (Mozambique) | Secondary mobile money provider |
| **Stripe** | Card payments | International cards (Visa/Mastercard), robust API, webhooks |

## Communication

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Ably / Pusher** | Real-time WebSockets | In-app messaging, live updates, presence |
| **Firebase Cloud Messaging** | Push notifications | Cross-platform push (iOS, Android, web) |
| **Resend / SendGrid** | Email | Transactional emails: booking confirmations, receipts, verification |
| **Twilio** | SMS | OTP verification, critical booking notifications |

## Location

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Google Maps API** | Maps & geocoding | Provider/organization location display, distance calculation, address autocomplete |

## Monitoring & Observability

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Sentry** | Error tracking | Real-time error monitoring, stack traces, performance |
| **Vercel Analytics / Axiom** | Logging & analytics | Structured logging, request tracing |

## Project Structure

```
ntizo/
├── apps/
│   ├── api/                    # Main API (Hono)
│   ├── admin/                  # Admin portal (Next.js)
│   ├── mobile/                 # Mobile app (React Native)
│   └── web/                    # Customer/Provider web app (Next.js)
├── packages/
│   ├── domain/                 # Domain layer (framework-agnostic)
│   │   └── src/{user,catalog,scheduling,pricing,booking,payment,communication,review}/
│   ├── application/            # Application layer (use cases)
│   │   └── src/{user,catalog,scheduling,pricing,booking,payment,...}/
│   ├── infrastructure/         # Infrastructure layer (adapters)
│   │   └── src/{database,auth,payment,notification,storage,location}/
│   ├── contracts/              # Shared API contracts (onion-lasagna)
│   └── shared/                 # Shared utilities, VOs, errors
├── turbo.json
├── package.json
└── bun.lockb
```

## Key Design Constraints

| ID | Constraint | Impact |
|----|-----------|--------|
| NFR-CON-001 | Hexagonal Architecture (onion-lasagna) | Domain layer has zero framework dependencies |
| NFR-CON-002 | DDD patterns | Each BC has its own aggregates, events, repository ports |
| NFR-CON-003 | Serverless deployment | No long-running processes; use queues for async work |
| NFR-CON-004 | Edge-first | API responses must work at edge (Cloudflare Workers / Vercel Edge) |
| NFR-CON-005 | PCI DSS compliance | Payment data never stored locally; delegated to payment processors |
| NFR-CON-006 | Mobile-first | All APIs designed for mobile consumption; low bandwidth optimization |

## Performance Targets

| Metric | Target |
|--------|--------|
| App load (3G) | < 3 seconds |
| API response (p95) | < 500ms |
| Search results | < 2 seconds |
| Payment processing | < 10 seconds |
| Push notification delivery | < 5 seconds |
| Concurrent users | 10,000 |
| API requests/sec | 1,000 |
| Database scale | 1M+ users |

## Deployment Strategy

| Environment | Purpose | Infrastructure |
|-------------|---------|---------------|
| Development | Local development | Bun + local PostgreSQL or Neon branch |
| Preview | PR preview deployments | Vercel preview + Neon branch |
| Staging | Pre-production testing | Vercel + Neon staging branch |
| Production | Live platform | Vercel/Cloudflare + Neon main |

## Security Standards

| Standard | Requirement |
|----------|-------------|
| Transport | TLS 1.2+ for all connections |
| Encryption at rest | AES-256 for sensitive data |
| Authentication | Better Auth with secure session management |
| Password hashing | bcrypt (via Better Auth) |
| API security | Rate limiting, input validation, CSRF protection |
| Payment security | PCI DSS compliance via payment processor delegation |
| Application security | OWASP Top 10 compliance |
| Audit logging | All admin and sensitive actions logged |

## Localization (Mozambique Launch)

| Aspect | Default |
|--------|---------|
| Primary language | Portuguese (pt-MZ) |
| Secondary language | English (en) |
| Currency | MZN (Metical) |
| Currency format | X.XXX,XX MZN |
| Timezone | Africa/Maputo (UTC+2) |
| Date format | DD/MM/YYYY |
| Time format | 24-hour |
| Phone format | +258 XX XXX XXXX |
