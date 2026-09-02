# Company Pages, and the Support Inbox Behind Them — Design

**Status:** approved in brainstorming, 2026-09-02. Awaiting the owner's review of this document before a plan is written.

**Mockups:** `2026-09-02-company-pages.mockup.html`, next to this file. The copy in it is the approved pt-MZ text and is the source the locale files are written from.

## What this is

The original request: *"Acho que devemos fazer aqui páginas sobre a empresa e adicionar uma secção no footer como este. Mas essas páginas devem ter uma boa UI/UX. Deve ser uma coisa profissional, bem feita, com um texto bem escrito."* The reference footer column reads: About, Contact, Message support, FAQ, Share feedback, Become a Provider, Careers.

Become a Provider already exists. The other six do not, and three of them (Contact, Message support, Share feedback) are forms with nowhere to send to. So this spec is two things:

1. **Six public pages** in one shared editorial frame, with text written for each and translated into the eight locales.
2. **A `support` bounded context** that stores what those forms send, emails the team, and gives an administrator a place to read and resolve it.

The footer's own code already says why the links were missing: *"About, Contact, FAQ and Careers used to sit around this link, all four on `href="#"`. A footer of eleven links where six go nowhere teaches a reader that none of them work; they come back one at a time, as the pages behind them are written."* This is them coming back.

## Decisions taken during brainstorming

Recorded with the alternative that lost, so nobody reopens them by accident.

| Decision | Chosen | Rejected |
|---|---|---|
| What a form submission does | Row in the database, email to the team, admin page to work the queue | Email only (a Resend outage loses the message); `mailto:` links (no form at all) |
| Where the rows live | A new `support` context, modelled on `review` | Reusing `communication` threads (customer↔provider only, needs a user on both ends, blocks contact details) |
| The About page's facts | Mission and product principles only; no founding year, city, names or legal entity | The owner chose not to publish personal or corporate facts |
| Contact channels | `ola@`, `suporte@`, `privacidade@` at **ntizo.co.mz**; Instagram and LinkedIn; no phone, no street address | The `.com` domain; the three different addresses the code carries today |
| Careers | No open roles; a spontaneous-application page | A static or admin-managed list of openings |
| Page top | A compact dark band (~300px) with the site header in overlay and the title left-aligned | A light top with an art panel; the full 660px hero the provider pitch uses |
| Form pages | Single centred column, three cards of alternatives below | Two columns with a side rail |
| FAQ navigation | All groups on one page, sticky index on the left, chips on a phone | Tabs showing one group at a time |
| Anti-abuse | A honeypot field and a per-IP count in the table | A captcha (a new dependency); nothing |
| The footer's payment chips | M-Pesa only, until the others actually charge | Leaving e-Mola, Visa and Mastercard advertised |

**One rule from the owner that applies to every page, new and existing:** no short accent-coloured hairline before an uppercase eyebrow label. *"Isso dá para ser páginas feitas por AI."* The only instance in the code (`become-provider-page.tsx`'s `Eyebrow`) was removed during this session and sits uncommitted on the working tree. Eyebrows are letter-spaced uppercase text and nothing else.

## The pages

| Route | Page | Kind |
|---|---|---|
| `/about` | Sobre a Ntizo | Editorial |
| `/contact` | Contacto | Form (`kind: contact`) |
| `/support` | Falar com o suporte | Form (`kind: support`) |
| `/faq` | Perguntas frequentes | Editorial, accordion |
| `/feedback` | Dar feedback | Form (`kind: feedback`) |
| `/careers` | Carreiras | Editorial |

All six are **top-level routes, outside `_public`**, for the reason `/privacy` gives in its own file: `_public` redirects anyone with a session away, which is right for a sign-in form and wrong for a page the signed-in are the most likely to read. All six are `ssr: true` and set their own `<head>` title (`Sobre · Ntizo`, in the active language). They are customer-zone pages: the phone's bottom bar shows, as it does on every customer page.

### The shared frame

One component, `CompanyPage`, wraps every page:

1. **The band.** Navy (`NAVY`), the site header in `overlay` mode on top, two faint accent circles for depth (as the provider pitch's pricing band does), then eyebrow, an oversized Poppins title, and one lede sentence. Left-aligned on the editorial pages; centred on the three form pages, where the form below is centred too. Height is whatever the text needs, around 300px on a desktop — not the provider pitch's 660px, which on six secondary pages in a row would tire the reader and push the answer under the fold on a phone.
2. **The body.** The page ground (`PAGE_TOP`), sections separated by hairlines, the same `page-shell` gutter as everything else.
3. **"Ainda tem dúvidas?"** A three-cell ruled strip linking to FAQ, Support and Contact — **each page omits the link to itself** and, on the form pages, offers Feedback in the vacated cell. This is how a reader who landed on the wrong page gets to the right one without the footer.
4. **The footer.**

### Sobre (`/about`)

Sections, in order, with the approved copy in the mockup:

1. **Band.** "Serviços locais em quem pode confiar." The lede names the three true promises: verified providers, the price shown, payment only after the provider confirms.
2. **Missão.** Two columns: the mission sentence large on the left ("Tornar a contratação de um serviço tão simples e segura como uma compra numa loja."), two short paragraphs on the right — the problem as it is lived, and what Ntizo does about it.
3. **Como funciona.** Three numbered steps from the customer's side: procure e compare; reserve a hora; pague depois da confirmação. Small accent numerals, not the outlined giants of the provider pitch.
4. **No que acreditamos.** Four principles in a ruled two-by-two grid: *O preço é o preço*; *Verificação antes de visibilidade*; *Pagar só depois do sim*; *Feito para aqui, pronto para crescer*.
5. **Dois públicos.** Two cards, customers and providers, each with one sentence, one paragraph and one button (Explorar serviços → `/services`; Torne-se prestador → `/become-provider`).
6. Shared strip and footer.

### Contacto, Suporte, Feedback

The same page, three times, from one `SupportForm` component that takes a `kind`. What differs:

| | Contacto | Suporte | Feedback |
|---|---|---|---|
| Band title | Fale connosco. | Precisa de ajuda com algo? | Diga-nos o que acha. |
| Topic field | Pergunta geral · Parceria · Imprensa · Sou prestador · Outro | A minha conta · Uma reserva · Um pagamento · A minha conta de prestador · Outro assunto | Uma ideia · Algo não funcionou · Gostei de algo |
| Email | required | required | optional, "se quiser resposta" |
| Cards below | ola@ntizo.co.mz · Instagram e LinkedIn · "É cliente com um problema? Fale com o suporte" | suporte@ntizo.co.mz · O que esperar · Perguntas frequentes | "Lemos tudo" · "Problemas com uma reserva? Fale com o suporte" · Perguntas frequentes |
| Extra | — | — | records the page the visitor came from (`origin_path`), silently |

The form itself: name, email, topic (select), message (textarea), and a visually hidden `website` field no person will fill. Above it, when signed out: *"Tem conta? Entre e preenchemos o nome e o email por si."* linking to sign-in with `next` set to the current path. When signed in, name and email are prefilled from the session and stay editable. Beside the submit button, one line: *"Guardamos esta mensagem para lhe responder. Mais nada."* with a link to the privacy policy.

**The success state replaces the form.** A check, "Recebemos a sua mensagem.", the email a reply will go to (omitted when none was given), and a short reference — the first six characters of the request id, uppercase. Two ghost buttons: back to the home page, and the FAQ. The reference is what a person quotes when they write again, and what the admin search matches.

**Errors the form must say in words:** field validation (inline, on blur); the rate limit (*"Recebemos várias mensagens deste dispositivo há pouco. Tente de novo dentro de uma hora, ou escreva para suporte@ntizo.co.mz."*); anything else (*"Não conseguimos enviar. Tente de novo, ou escreva-nos para …"*). A failure never loses what was typed.

### Perguntas frequentes (`/faq`)

Twenty questions in three groups: **Clientes** (8), **Prestadores** (7), **Pagamentos e segurança** (5). The full list with answers is in the mockup and is the approved text.

Layout: a 200px left column with the group index (`position: sticky`, anchors to each group's heading, the active group highlighted by scroll position) and a "Não encontrou?" card that links to `/support`; the groups on the right, one after the other. Each question is a native `<details>` — no library — with the first of each group open by default. On a phone the index becomes a row of chips above the list. Everything is on one page so that Ctrl+F works, a shared link lands on the question, and a crawler sees all of it.

**Every answer was checked against what the product does today**, and the plan must re-check before shipping:

- Only M-Pesa (Vodacom) charges (`MpesaPaymentCharge` is the sole `PaymentChargePort` adapter; the checkout copy says the same). e-Mola and cards are payout methods and stored payment methods, not charge methods.
- Payment is requested only after the provider accepts (`AWAITING_PROVIDER → PENDING_PAYMENT`); an unanswered or declined request charges nothing.
- There is no refund path and no customer-initiated cancellation — the only `cancel` is the sweep's `customer_did_not_pay`. The FAQ therefore says *before confirmation the request commits you to nothing; after confirmation and payment, write to support*. It never promises a cancel button or a refund.
- Hourly and quote-priced services are not bookable through checkout (`SERVICE_NOT_BOOKABLE_HOURLY`; the quote notice) — the answer sends the reader to the provider's messages.
- Verification is one identity document (BI, DIRE or passport), reviewed by a person unless `auto_approve_providers` is on; the provider is emailed on approval (`provider-verified` template).
- A review needs a `COMPLETED` booking with that provider; one per person per provider, changeable.
- Messages refuse phone numbers and emails (`hasContact`).
- Stored payment data is the mobile-money number and country, never a card number (from the privacy policy).
- Account deletion is by writing to `privacidade@ntizo.co.mz`, answered within 30 days (from the privacy policy).
- "A sua taxa está indicada na sua área de prestador" depends on the commission-visibility plan (`2026-08-31-provider-commission-visibility.md`) having shipped; the plan verifies it and, if not, the sentence becomes *"é-lhe indicada antes de publicar"*.

**No number that lives in `platform_settings` appears in the copy** — not the 2-hour provider window, the 15-minute payment window, the 30-minute hold, the 10% default commission or the 3-day earnings hold. Those are LIVE settings an administrator changes without the page knowing. The copy says "o prazo indicado no pedido", "o período de retenção indicado na carteira".

### Carreiras (`/careers`)

1. **Band.** "Construa a Ntizo connosco." The lede says plainly that there are no open roles and that every application is read.
2. **Two columns.** *O que estamos a construir* (two paragraphs) and *Como trabalhamos* (three short principles: escrevemos antes de construir; enviamos cedo, corrigimos depressa; quem usa vem primeiro). These three are the only sentences on the six pages not derived from the code; the owner approved them.
3. **Vagas abertas.** One card: "Nenhuma neste momento.", an invitation to write anyway, and a button that opens `mailto:ola@ntizo.co.mz` with the subject prefilled (*Candidatura espontânea*). No new inbox: the owner unified on three addresses and careers is general correspondence.
4. Shared strip and footer.

## Contact channels, in one place

`apps/frontend/web/src/shared/lib/contact.ts` exports the three addresses and the two social URLs. Everything that prints one reads from it:

- the footer (today `hello@ntizo.com`),
- the provider pitch's closing band (today `ola@ntizo.com`),
- the legal pages' "questions about this document" line (already `privacidade@ntizo.co.mz`, but written into eight locale files — the address becomes an interpolation),
- the six new pages and the support form's own error copy.

`platform_settings.support_email` and `support_phone` exist in the database and nothing reads them. They stay as they are; wiring them is a follow-up with a clear trigger (the day the address has to change without a deploy).

## The footer

- **Empresa** column, in the reference's order: Sobre, Contacto, Falar com o suporte, Perguntas frequentes, Dar feedback, Torne-se prestador, Carreiras. (English: About, Contact, Message support, FAQ, Share feedback, Become a Provider, Careers.)
- **Suporte** column: the address becomes `suporte@ntizo.co.mz`.
- **Métodos de pagamento aceites:** M-Pesa only. The other three chips advertised methods the checkout refuses — "a promise made to someone who has not paid yet", as the footer's own comment says about the four it already removed. Follow-up, with its trigger: *when e-Mola or card charging ships, its chip returns the same day.*
- The `Legal` column and the socials are unchanged.

## Backend: the `support` context

Modelled on `review`: small, one aggregate, an admin query, no cross-context ports.

### Table `ntizo_support.support_request`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | its first six hex characters, uppercased, are the reference shown to people |
| `kind` | text | `contact` \| `support` \| `feedback` |
| `topic` | text | one of the kind's allowed values (below) |
| `name` | text not null | 2–80 characters, trimmed |
| `email` | text null | required unless `kind = feedback`; ≤ 254, shape-checked |
| `message` | text not null | 10–2000 characters, trimmed |
| `requester_user_id` | text null, fk `user` on delete set null | from the session when there is one |
| `locale` | text not null | the UI language at submission (`pt-MZ`, …), so the reply comes in it |
| `origin_path` | text null | ≤ 200; the page the form was reached from, sent by the feedback page only |
| `ip_address` | text null | from the GraphQL context; the rate limit counts on it |
| `user_agent` | text null | from the GraphQL context |
| `status` | text not null | `open` \| `resolved`, default `open` |
| `resolved_at` | timestamptz null | |
| `resolved_by_user_id` | text null, fk `user` on delete set null | |
| `created_at` | timestamptz not null default now | |

Indexes: `(status, created_at desc)` for the admin list; `(ip_address, created_at)` for the rate limit; `(kind)`.

Topics per kind — stored as text, validated by the aggregate:

- `contact`: `general`, `partnership`, `press`, `provider`, `other`
- `support`: `account`, `booking`, `payment`, `provider_account`, `other`
- `feedback`: `idea`, `problem`, `praise`

Migration: one new drizzle migration adding the schema and table; `ntizo_support` joins `schemaFilter` in `drizzle.config.ts`.

### Aggregate `SupportRequest`

Invariants, each with a named exception in `domain/exceptions.ts`:

- name and message within bounds after trimming;
- email present and well-formed unless `kind` is `feedback`; when present on feedback it is still well-formed;
- `topic` belongs to `kind`'s list;
- `resolve(at, byUserId)` from `open` records both and moves to `resolved`; from `resolved` it is a no-op. `reopen()` is the mirror. Idempotent on purpose: two administrators clicking the same button is not an error.

### Use cases

**`SubmitSupportRequestCommand`** — public. Input: kind, topic, name, email, message, locale, originPath, plus `requesterUserId`, `ipAddress` and `userAgent` from the context. Steps, in this order:

1. **Rate limit.** `repository.countSince(ipAddress, now − 60 min)`; at 5 or more, throw `SupportRateLimitedError` (`code: SUPPORT_RATE_LIMITED`). No IP in the context (should not happen) skips the check rather than blocking.
2. **Create and save** the aggregate.
3. **Notify the inbox** through `SupportInboxPort.notify(request)`. This runs after the save has returned. A thrown error is caught and logged with the request id; it never fails the command. The row is the source of truth and the admin page will show it regardless.

Returns `{ requestId }`.

**`ListSupportRequestsForAdminQuery`** — input `kind?`, `status?`, `search?` (≤ 120 chars; ILIKE across name, email, message, and the id's text prefix so a quoted reference finds its row), `limit` (≤ 100), `offset`. Output `{ items, total, openCount }`, where `openCount` ignores the filters — it is the badge number for the whole queue. Read model `SupportRequestAdminDTO` in `@ntizo/shared/read-models/system/support`.

**`SetSupportRequestStatusCommand`** — input `requestId`, `status`, `actorUserId`. `SupportRequestNotFoundError` when the row is missing.

### The inbox email

`SupportInboxPort` has one adapter, `EmailSupportInboxAdapter`, built on the shared `EmailServicePort` via `resolveEmailService()` (so a local stage prints it to the terminal, exactly as verification emails do). It sends to `env.SUPPORT_INBOX_EMAIL`, a new **optional** `InfraEnvBindings` entry in the shape of the M-Pesa ones: absent, the adapter logs "no inbox configured" and returns; the request is still saved.

Subject: `[Ntizo] Suporte: Uma reserva — Joana M.` (kind and topic labels in Portuguese, the team's language). Body: every field, the reference, the locale, and a link to `${APP_URL}/admin/support`. **`EmailMessage` gains an optional `replyTo`**, passed to Resend as `reply_to`, set to the requester's email when there is one — so replying from the inbox reaches the person, not `EMAIL_FROM`.

### GraphQL

- `supportRequest.submit` on the **write tier**. This is the first anonymous mutation there; the context already models `requesterUserId: null`, and the handler simply does not call `requireUser`. It reads `requesterUserId`, `ipAddress` and `userAgent` off the context and passes them in. The input carries the honeypot as `website: z.string().optional()` — it must *accept* a value, not reject one, because the point is to act on it quietly: **when `website` is non-empty the handler returns `{ requestId: randomUUID() }` without executing the command.** A bot that filled the trap gets a success it cannot tell from the real one, and the row it would have written never exists.
- `supportRequest.allForAdmin` on the **read tier**, behind `requireAdmin` (the same six-line helper the review handlers copy rather than share).
- `supportRequest.setStatus` on the write tier, behind `requireAdmin`.

Errors reach the client with the kit's codes: `SUPPORT_RATE_LIMITED`, validation errors from the zod edge, `ADMIN_ONLY`, `SUPPORT_REQUEST_NOT_FOUND`.

### What the context deliberately does not do

- **No domain events, no outbox.** Nothing consumes "a support request was submitted" or "was resolved" — not Notification (the requester is not told), not Activity. Adding an outbox event with no handler would be ceremony. The day either consumer exists, the command gains an event the way `SubmitReviewCommand` has one.
- **No reply from inside the app.** The administrator replies from the inbox; the admin page's "Responder por email" is a `mailto:` with the address, a subject carrying the reference, and nothing else. An in-app reply thread is a follow-up.

### Privacy policy

One sentence joins "O que recolhemos" in all eight locales: *what you write to us through the contact, support and feedback forms, and the IP address it was sent from, so we can reply and stop abuse.* The policy already discloses IP addresses for sessions; this makes the forms honest too.

## Admin: `/admin/support`

- **Navigation:** "Suporte" (`Inbox` icon) after Utilizadores and before Categorias — it is a queue worked daily, like the provider review queue, not curated content like categories and reviews.
- **Page**, on the `/admin/reviews` pattern: `usePageHeader`; the open count as the sentence the page is about ("12 pedidos abertos"); filter buttons for kind (Todos · Contacto · Suporte · Feedback) and status (Abertos · Resolvidos · Todos, default Abertos); a search box; a `CollectionCard` list; offset pagination at 25 a page.
- **A row:** kind badge, topic label, name and email (the name links to `/admin/users` filtered by that user when `requesterUserId` is set), the first ~140 characters of the message, locale, relative date. Clicking expands the row to the full message, `origin_path`, IP and user agent.
- **Actions per row:** "Responder por email" (`mailto:` with subject `[Ntizo #7F3A2C] <topic>`), and "Marcar resolvido" / "Reabrir". Not optimistic — like the featured toggle, and for the same reason: the count on the same payload would have to be kept in step by hand. Both the list and its count invalidate on success.
- **Empty states** in words: no open requests ("Nada por responder."), a search with no match.

## Frontend: structure

```
apps/frontend/web/src/
  routes/about.tsx  contact.tsx  support.tsx  faq.tsx  feedback.tsx  careers.tsx
  routes/admin/support.tsx
  features/company/
    ui/company-page.tsx          the frame: band, body, "Ainda tem dúvidas?", footer
    ui/about-page.tsx  careers-page.tsx  faq-page.tsx
    ui/contact-page.tsx  support-page.tsx  feedback-page.tsx   (thin: band copy + <SupportForm kind>)
    ui/support-form.tsx          fields, honeypot, prefill, success state, errors
    ui/faq-index.tsx             sticky index / phone chips, scroll-spy
    domain/topics.ts             the topics per kind, shared with the select and the tests
    data/support-request.repository.ts   submit via sessionGraphql — see note below
    viewmodel/use-submit-support-request.ts
  features/admin/support/
    data/admin-support.repository.ts   allForAdmin + setStatus via sessionGraphql
    viewmodel/use-admin-support.ts
    ui/support-page.tsx
  shared/lib/contact.ts          the three addresses and two social URLs
  shared/locales/<locale>/company.json   new namespace, eight files
```

- **Which endpoint the form talks to.** `sessionGraphql`, the private `/graphql` mount — not `publicGraphql`. The public mount serves `publicSchema` only (queries, no mutations) and builds an empty context, so it has neither the IP the rate limit counts on nor the session the prefill and `requester_user_id` come from. The private mount already accepts anonymous callers: `createGraphqlContextFactory` resolves no session to `requesterUserId: null` and role `customer`, and field-level authorization is each handler's own job. `credentials: "include"` simply attaches a session when there is one. The form submits from the browser only, never during SSR, so the endpoint's browser-only URL is not a problem.
- **i18n:** namespace `company` registered in `i18n.ts` and added to `NAMESPACES` in the locale parity test beside `directory` and `checkout`. pt-MZ is authored first (it is the reference the test compares against) from the mockup's copy; the other seven are written from it, not machine-translated word for word — each must read as its own language. `landing.json` gains the Empresa column keys; `admin.json` gains the support page's; `legal.json` gains the privacy sentence and the interpolated address.
- **The FAQ's questions live in the locale file as an array** of `{ group, items: [{ q, a }] }`, the way the legal sections do, so a translator can reorder or drop one without touching the component.
- **Form state** is local (`useState` per field, or `@tanstack/react-form`, which the checkout details page already uses — the plan follows whatever `details-page.tsx` does). No draft persistence.
- **Phone:** the band's title steps down with `clamp()`; the form is full-width; the three cards stack; the FAQ index becomes chips; the strip's three cells stack.

## Testing

**Backend** (`packages/backend`, vitest, the shared-database conventions in `follow-ups.md`):

- Aggregate: each invariant, both transitions, idempotence.
- `SubmitSupportRequestCommand`: saves and returns the id; refuses the sixth request from one IP in an hour and allows the sixth after; calls the inbox port after save with the saved request; an inbox that throws does not fail the command and the row exists.
- Handlers: a filled honeypot returns a uuid-shaped id and the repository is untouched; anonymous submit works; `allForAdmin` and `setStatus` refuse a non-admin with `ADMIN_ONLY`.
- Query: kind and status filters, search across the four fields including the reference prefix, `openCount` unaffected by filters, pagination.
- `EmailSupportInboxAdapter`: no inbox configured → no send, no throw; configured → `to`, `replyTo`, subject and body contain what they must.

**Frontend** (`apps/frontend/web`, vitest + testing-library, the route-suite pattern in `routes/__tests__`):

- Each of the six routes renders its title and sections; the strip omits the page's own link.
- `SupportForm`: prefilled when a user is in the query cache; validation messages; success state shows reference and email; `SUPPORT_RATE_LIMITED` shows the rate-limit sentence and keeps the typed message; the honeypot field is not visible.
- Locale parity: `company` (and `landing`, if it passes as-is — verify before adding) declare the same dotted paths in all eight files, no empty strings.
- Footer: the seven Empresa links resolve to the six routes plus `/become-provider`; the payment row shows one chip.
- Admin page: list renders, filters change the query key, resolve invalidates.

**E2E** (`apps/e2e/tests/company.spec.ts`): submit the support form signed out, read the reference off the success state, sign in as the admin, find the request by that reference, mark it resolved, see it leave the open list.

## Not in this spec (follow-ups, each with its trigger)

- **Reply from inside the admin page**, with the thread stored — trigger: the first week the inbox has more than a handful of open requests a day.
- **Notify the requester when resolved** — trigger: the same.
- **Read the support address from `platform_settings`** — trigger: the address has to change without a deploy.
- **Payment chips return to the footer** — trigger: e-Mola or card charging ships.
- **A careers listing** — trigger: the first open role.
- **A captcha** — trigger: the honeypot and the per-IP count stop being enough, measured in the admin list.
- **Contact-detection copy in messaging** (`follow-ups.md` #85) now has somewhere to point: the FAQ answer on why numbers are blocked. Update that copy when this ships.
