# Orçamentos — Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the customer and provider web screens for the quote (orçamento) flow, whose backend
shipped on 2026-09-07 and is live on dev.

**Architecture:** Two new web features following the house layout — `features/quotes/{data,domain,
viewmodel,ui}` for the customer and `features/provider/quotes/{…}` for the provider — plus six new
file routes, one new locale namespace in eight locales, one new console nav item with its count
source, and two edits to already-shipped directory screens so the "Pedir orçamento" button finally
goes somewhere. No backend change: every field this plan selects was introspected from a running
server on 2026-09-07 and is reproduced verbatim below.

**Tech Stack:** TanStack Start file routes, TanStack Query v5, `sessionGraphql`, i18next,
`@ntizo/frontend-ui`, Tailwind v4 CSS variables, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-quotes-design.md` (sections "The GraphQL surface",
"The screens", BR-Q1..BR-Q10). The approved mockup is
`docs/superpowers/specs/2026-09-07-quotes.mockup.html` — **all pt-MZ copy comes from it verbatim**,
published at https://claude.ai/code/artifact/7e87fc88-129d-4423-a199-c02140adbf2a.

---

## Global Constraints

1. **Two test runners, not interchangeable.** `apps/frontend/web` and `packages/shared` run
   **vitest** — import from `"vitest"`, run with `bun run test` from the package directory or
   `bunx vitest run <path>`. `packages/backend` and `apps/backend/api` run **`bun test`** and import
   from `"bun:test"`. This plan touches only vitest packages. A test file that imports `"bun:test"`
   under `apps/frontend/web` fails to collect.
2. **The web app has two vitest projects.** `web` covers everything except `src/routes/__tests__/**`;
   `routes` additionally loads `src/test/route-suite-setup.ts`. Route-guard suites go in
   `src/routes/__tests__/`; everything else goes beside its feature.
3. **Layer boundaries are lint-enforced** (`eslint-plugin-boundaries`, `boundaries/no-unknown-files:
   error`). `domain → domain`; `data → domain, data, shared`; `viewmodel → domain, data, viewmodel,
   shared`; **`ui → domain, viewmodel, ui, shared` and never `data`**; `routes → domain, viewmodel,
   ui, routes, shared`. A file in a folder no pattern matches is an error, which is why Task 2 adds
   the `provider/quotes` patterns before any provider file exists.
4. **GraphQL documents are plain template literals with flattened wire names.** No `gql` tag. One
   `$input: XInput!` variable per operation. Field names are flat (`quoteMine`, never
   `quote { mine }`). Extract the selection set into an exported `const` so a repository test can
   assert it.
5. **Every wire name and field in this plan was introspected from a running server.** Do not "fix"
   one against the read-model source; if a query is rejected, report it rather than renaming.
6. **`applied: false` and `validUntil: null` are not errors and are not success.** They mean the
   compare-and-swap lost. The UI shows a "this moved on" notice and refetches. Never report success.
7. **Branch on `error.code`, never `error.message`.** `sessionGraphql` throws `GraphqlError` whose
   `.code` prefers `extensions.originalCode`.
8. **Eight locales:** `en-US`, `pt-PT`, `pt-MZ`, `es-ES`, `de-DE`, `fr-FR`, `it-IT`, `nl-NL`. pt-MZ
   is the reference in `locales.test.ts`; en-US is the reference in `i18n-parity.test.ts`. Every
   locale must declare exactly the same dotted leaf paths, and no leaf may be an empty string.
9. **pt-MZ copy is transcribed from the mockup, never invented or back-translated.** The other seven
   locales are translated from pt-MZ.
10. **Money:** `formatMoney(minor, currency, locale)` from
    `@/features/wallet/domain/money`. Commission is
    `Math.round((priceMinor * commissionBps) / 10_000)` — the exact expression
    `booking.aggregate.ts:411` uses. Any other rounding disagrees with the booking by a cent.
11. **Dates take an explicit `timeZone`** — `quote.timezone` from the read model. `slotWording` /
    `compactSlotWording` / `momentWording` from `@/features/checkout/domain/slot-wording` never
    default it.
12. **One clock instant per render:** `const now = useMemo(() => new Date(query.dataUpdatedAt ||
    Date.now()), [query.dataUpdatedAt])`. Pages do not run their own `Date.now()` per row.
13. **The typecheck script has two names.** Inside `apps/frontend/web` it is `bun run typecheck`;
    from the repository root it is `bun run check-types`, which is the turbo task that runs every
    package's `typecheck`. `bun run check-types` inside the web package fails with "Script not
    found".
14. **Commit after every task.** Conventional commits, lowercase, in the repo's voice (a sentence
    about what changed, not a label).

---

## The verified API

Introspected 2026-09-07 against `wrangler dev` on the `feat/quotes-web` tree. Reproduce exactly.

### Queries

```
quoteMine(input: { tab: "open" | "history", limit: Int, offset: Int })
  -> { items: [CustomerQuote], counts: { open, history }, hasMore: Boolean }

quoteById(input: { quoteId: String! })
  -> CustomerQuoteDetail | null

quoteForProvider(input: { providerId: String!, tab: "toAnswer" | "waiting" | "history",
                          limit: Int, offset: Int })
  -> { items: [ProviderQuote], counts: { toAnswer, waiting, history }, hasMore: Boolean }

quoteByIdForProvider(input: { providerId: String!, quoteId: String! })
  -> ProviderQuoteDetail | null

quoteCountsForProvider(input: { providerId: String! }) -> { toAnswer: Int }
```

### Selection sets (copy verbatim)

```
QUOTE_PROPOSAL_FIELDS =
  id priceMinor currency startsAt endsAt durationMinutes providerMemberId memberFirstName
  note validUntil createdAt supersededAt supersededCause
  attachments { id step proposalId fileName contentType sizeBytes }

CUSTOMER_QUOTE_FIELDS =
  id status serviceId serviceName providerId timezone threadId
  expiresAt expiredCause closedReason bookingId requestedAt
  providerName providerSlug providerVerified
  proposal { <QUOTE_PROPOSAL_FIELDS> }

CUSTOMER_QUOTE_DETAIL_FIELDS = CUSTOMER_QUOTE_FIELDS +
  description neededBy
  address { label line city district directions }
  requestAttachments { id step proposalId fileName contentType sizeBytes }
  proposals { <QUOTE_PROPOSAL_FIELDS> }
  closedNote
  closingAttachments { id step proposalId fileName contentType sizeBytes }

PROVIDER_QUOTE_FIELDS =
  id status serviceId serviceName providerId timezone threadId
  expiresAt expiredCause closedReason bookingId requestedAt
  customerFirstName addressDistrict addressCity neededBy descriptionSnippet attachmentCount
  proposal { <QUOTE_PROPOSAL_FIELDS> }

PROVIDER_QUOTE_DETAIL_FIELDS = PROVIDER_QUOTE_FIELDS +
  description customerCompletedBookings
  requestAttachments { id step proposalId fileName contentType sizeBytes }
  proposals { <QUOTE_PROPOSAL_FIELDS> }
  closedNote
  closingAttachments { id step proposalId fileName contentType sizeBytes }
  commissionBps
  performers { id firstName }
```

**Note what the customer's read model does not carry:** no provider rating, no job count, no logo,
no service image. The mockup's "4,8 ★ · 96 trabalhos" line on `/quotes/$quoteId` is therefore not
built (see Deviations). The request page `/quote/$serviceId` *can* show it, because it loads the
service detail, which carries `providerRatingAverage` and `providerLogoUrl`.

**Note the pager:** `hasMore: Boolean`, **not** `total` / `nextOffset`. The bookings pager idiom
(`answered.nextOffset !== null`) does not transfer. Page with `offset + QUOTES_PAGE_SIZE` while
`hasMore`, and feed `CollectionCard`'s `total` from `counts[tab]`.

### Mutations

```
quoteRequest(input: { serviceId: String!, description: String!, neededBy: String,
                      address: { label!, line!, city!, district, directions, lat, lng },
                      attachments: [{ storageKey: String! }], locale: String! })
  -> { quoteId: String, respondBy: String }

quotePropose(input: { quoteId!, priceMinor: Int!, startsAt: String!, durationMinutes: Int!,
                      providerMemberId: String!, note: String, attachments: [{ storageKey! }] })
  -> { quoteId: String, validUntil: String }        // validUntil null => the CAS lost

quoteDecline(input: { quoteId!, reason: String!, note, attachments }) -> { quoteId, applied }
quoteReject (input: { quoteId!, reason: String!, note, attachments }) -> { quoteId, applied }
quoteWithdraw(input: { quoteId!, note, attachments })                 -> { quoteId, applied }

quoteAccept(input: { quoteId!, address: { label!, line!, city!, district, directions, lat, lng } })
  -> { bookingId: String, payBy: String }
```

No mutation takes a user id; every one resolves the actor from the session. `neededBy` is
`YYYY-MM-DD`. `description` is trimmed, 1..4000. `note` is trimmed, max 2000. `attachments` is at
most 5 storage keys. `durationMinutes` is 1..1440. `priceMinor` is a positive integer.

### Enums (`@ntizo/shared`, `packages/shared/src/enums/quote-enums/index.ts`)

```ts
QUOTE_STATUSES               = ["REQUESTED","PROPOSED","ACCEPTED","DECLINED","REJECTED","WITHDRAWN","EXPIRED"]
CUSTOMER_QUOTE_TABS          = ["open","history"]
PROVIDER_QUOTE_TABS          = ["toAnswer","waiting","history"]
QUOTE_PROVIDER_DECLINE_REASONS = ["not_available","cannot_perform","outside_area","other"]
QUOTE_CUSTOMER_REJECT_REASONS  = ["too_expensive","wrong_time","found_elsewhere","other"]
QUOTE_EXPIRED_CAUSES         = ["provider_did_not_respond","proposal_lapsed"]
QUOTE_SUPERSEDED_CAUSES      = ["revised","slot_taken"]
QUOTE_ATTACHMENT_STEPS       = ["request","proposal","closing"]
```

### Error codes the UI must handle by name

`QUOTE_NOT_FOUND`, `QUOTE_NOT_YOURS`, `QUOTE_TRANSITION`, `QUOTE_SERVICE_NOT_QUOTABLE`,
`QUOTE_ALREADY_OPEN`, `QUOTE_PROPOSAL_LAPSED`, `QUOTE_SLOT_TAKEN`, `QUOTE_SLOT_OVERLAP`,
`QUOTE_PRICE_BELOW_MINIMUM`, `QUOTE_NO_CUSTOMER_PHONE`, `QUOTE_ADDRESS_REQUIRED`,
`QUOTE_MEMBER_CANNOT_PERFORM`, `QUOTE_STARTS_IN_PAST`, `QUOTE_DURATION_INVALID`,
`CONTACT_DETECTED`, `UNAUTHENTICATED`.

### Attachments

- **Upload:** `POST ${API_BASE_URL}/api/communication/attachments`, `credentials: "include"`,
  `FormData` field `file`. `201 { storageKey, fileName, contentType, sizeBytes }`. Same endpoint the
  messaging UI already uses — reuse `uploadAttachment` from
  `@/features/messaging/data/attachment.repository`.
- **Download:** `GET ${API_BASE_URL}/api/quote/attachments/:id`, `credentials: "include"`,
  session-gated, `content-disposition: attachment`. **A different path from messaging's** — quotes
  need their own fetcher.
- Limits from `@/features/messaging/domain/types`: `MAX_ATTACHMENTS` (5),
  `MAX_ATTACHMENT_BYTES`, `ACCEPTED_ATTACHMENT_TYPES`.

---

## File structure

**New — customer** (`apps/frontend/web/src/features/quotes/`)

| File | Responsibility |
|---|---|
| `domain/status.ts` | `QUOTES_PAGE_SIZE`, `STATUS_TONE`, `customerStatusKey`, `providerStatusKey`, `clockOf`, `whoseTurn`, `canAccept/canReject/canWithdraw` |
| `domain/money-split.ts` | `commissionMinorOf`, `payoutMinorOf` — the backend's rounding, mirrored |
| `domain/__tests__/status.test.ts`, `__tests__/money-split.test.ts` | |
| `data/quote.repository.ts` | documents, `myQuoteQueries`, `requestQuote`, `rejectQuote`, `withdrawQuote`, `acceptQuote` |
| `data/quote-attachment.repository.ts` | `fetchQuoteAttachmentBlob` |
| `data/__tests__/quote.repository.test.ts` | |
| `viewmodel/use-my-quotes.ts` | `useMyQuotes`, `useMyQuote`, `useRequestQuote`, `useCloseQuote`, `useAcceptQuote` |
| `viewmodel/use-quote-attachments.ts` | pick / validate / upload-all, shared with the provider side |
| `viewmodel/use-quote-attachment-download.ts` | |
| `ui/attachment-picker.tsx`, `ui/attachment-list.tsx` | shared by both sides |
| `ui/quote-status.tsx` | the dot + words, both readers |
| `ui/request-page.tsx` | `/quote/$serviceId` |
| `ui/quotes-page.tsx` | `/quotes` |
| `ui/quote-page.tsx` | `/quotes/$quoteId` |
| `ui/accept-page.tsx` | `/quotes/$quoteId/accept` |
| `ui/close-dialog.tsx` | reason + note + files; serves reject and withdraw |
| `ui/__tests__/*.test.tsx` | one per page |

**New — provider** (`apps/frontend/web/src/features/provider/quotes/`)

| File | Responsibility |
|---|---|
| `data/quote.repository.ts` | provider documents + `providerQuoteQueries` + `proposeQuote`, `declineQuote` |
| `viewmodel/use-provider-quotes.ts` | `useProviderQuotes`, `useProviderQuote`, `useQuoteToAnswerCount`, `useAnswerQuote` |
| `ui/quote-row.tsx` | `quoteColumns(t)` + `quoteRow(q, ctx)` |
| `ui/quotes-page.tsx` | `/provider/$slug/quotes` |
| `ui/quote-page.tsx` | `/provider/$slug/quotes/$quoteId` |
| `ui/proposal-form.tsx` | price, date, time, duration, member, note, files, the split |
| `ui/decline-dialog.tsx` | reason + note + files |
| `ui/__tests__/*.test.tsx` | |

**New — routes**

`src/routes/_customer/quote.$serviceId.tsx`, `quotes.index.tsx`, `quotes.$quoteId.tsx`,
`quotes.$quoteId.accept.tsx`; `src/routes/provider/$slug/quotes.index.tsx`,
`quotes.$quoteId.tsx`.

**New — shared**

`src/shared/domain/address-input.ts` (lifted out of `confirm-page.tsx`).

**Modified**

`src/shared/lib/i18n.ts`, `src/shared/lib/console-nav.ts`,
`src/shared/lib/__tests__/console-nav.test.ts`, `src/shared/components/console/console-counts.tsx`,
`src/shared/components/user-menu.tsx` (+ its test), `eslint.config.js`,
`src/features/directory/services/data/service-detail.repository.ts` (+ its test),
`src/features/directory/services/ui/service-row.tsx`,
`src/features/directory/services/ui/service-quote-notice.tsx`,
`src/features/checkout/ui/confirm-page.tsx`, `src/shared/locales/*/common.json` (×8),
`src/shared/locales/*/quotes.json` (×8, new), `src/shared/locales/__tests__/locales.test.ts`.

---

## Deviations from the mockup, decided here

1. **No provider rating or job count on `/quotes/$quoteId`.** `customerQuoteDetailReadModel` carries
   only `providerName`, `providerSlug`, `providerVerified`. The rail shows the name, the verified
   mark and a link to the provider's page. Adding a second query per quote detail to recover
   "4,8 ★ · 96 trabalhos" is not worth it; the request page still shows them, from the service
   detail it already loads.
2. **"Orçamentos" goes in the user menu, not the site header.** `SiteHeader` renders only
   `PUBLIC_NAV` (`/`, `/services`, `/providers`) plus the user menu; Reservas, Mensagens, Favoritos
   and Actividade all live in the menu. The mockup's header row is a drawing convention, not the
   shipped header.
3. **The provider's availability check ("Sábado … está livre na sua agenda") is not built.** The
   backend refuses an overlapping proposal with `QUOTE_SLOT_OVERLAP`; the form surfaces that as a
   refusal on submit instead of a live green line. A live check needs a query that does not exist.
4. **Drag-and-drop upload is not built.** The picker is a button, as in messaging. "ou arraste para
   aqui" is dropped from the pt-MZ copy.
5. **A closed quote shows why it closed, not when.** The mockup's history rows carry a date
   ("Recusado pelo prestador · 26 Ago"), and the read model has no closing timestamp — `expiresAt`
   on a closed quote is the deadline that was still running when it closed, so printing it would be
   printing the wrong date. The rows show `closedReason` instead. Adding a `closed_at` to the read
   model is backend work outside this plan; if it lands later, `clockOf` gains one branch.

---

### Task 1: The `quotes` locale namespace, in eight locales

Everything downstream reads these keys, so this lands first. Nothing renders yet; the gate is the
two parity suites.

**Files:**
- Create: `apps/frontend/web/src/shared/locales/{en-US,pt-PT,pt-MZ,es-ES,de-DE,fr-FR,it-IT,nl-NL}/quotes.json`
- Modify: `apps/frontend/web/src/shared/locales/{…8…}/common.json` (add one key)
- Modify: `apps/frontend/web/src/shared/lib/i18n.ts`
- Modify: `apps/frontend/web/src/shared/locales/__tests__/locales.test.ts`
- Test: the two suites above

**Interfaces:**
- Consumes: nothing.
- Produces: the `quotes` namespace, read as `useTranslation("quotes")`, and `common:quotes` for the
  user menu's label.

- [ ] **Step 1: Write pt-MZ, the reference**

Create `apps/frontend/web/src/shared/locales/pt-MZ/quotes.json`. Copy transcribed from the approved
mockup; do not reword.

```json
{
  "list": {
    "title": "Os meus orçamentos",
    "blurb": "O que pediu, o que já tem resposta, e o que ainda está a contar.",
    "tab": { "open": "Em aberto", "history": "Histórico" },
    "column": { "service": "Serviço", "status": "Estado", "price": "Preço" },
    "emptyTitle": "Ainda não pediu orçamentos",
    "emptyText": "Nos serviços marcados «sob orçamento», conte o que precisa e o prestador responde com um preço e uma data.",
    "emptyAction": "Ver serviços sob orçamento",
    "noPriceYet": "sem preço ainda",
    "noProposal": "sem proposta",
    "notAccepted": "não aceite",
    "more": "Mais",
    "loadError": "Não foi possível carregar os seus orçamentos."
  },
  "unit": {
    "min": "{{count}} min",
    "h": "{{count}} h",
    "d": "{{count}} dias",
    "d_one": "{{count}} dia"
  },
  "status": {
    "customer": {
      "REQUESTED": "À espera de proposta",
      "PROPOSED": "Proposta recebida",
      "ACCEPTED": "Aceite",
      "DECLINED": "Recusado pelo prestador",
      "REJECTED": "Recusou a proposta",
      "WITHDRAWN": "Retirou o pedido",
      "EXPIRED": "Expirado"
    },
    "provider": {
      "REQUESTED": "Por responder",
      "PROPOSED": "Proposta enviada",
      "ACCEPTED": "Aceite",
      "DECLINED": "Recusou",
      "REJECTED": "Cliente recusou",
      "WITHDRAWN": "Cliente retirou",
      "EXPIRED": "Expirado"
    }
  },
  "clock": {
    "customer": {
      "respondBy": "responde até {{when}}",
      "yourDecision": "a sua decisão · válida até {{when}}",
      "becameBooking": "passou a reserva",
      "closedReason": "{{reason}}",
      "providerDidNotRespond": "o prestador não respondeu · {{when}}",
      "proposalLapsed": "a proposta caducou · {{when}}"
    },
    "provider": {
      "answerBy": "até {{when}} · faltam {{left}}",
      "overdue": "até {{when}} · prazo passado",
      "askedAgo": "pedido há {{ago}}",
      "validUntil": "válida até {{when}}",
      "revisedOnce": "válida até {{when}} · revista uma vez",
      "didNotRespond": "não respondeu · {{when}}",
      "customerDidNotDecide": "o cliente não decidiu · {{when}}"
    }
  },
  "request": {
    "title": "Pedir orçamento",
    "lead": "Quanto mais contar, mais certo vem o preço. {{provider}} lê isto e responde com um valor, uma data e a duração.",
    "introBy": "{{provider}}:",
    "descriptionLabel": "O que precisa",
    "descriptionPlaceholder": "Conte o que precisa: o que é, quantos, onde, e o que já tem.",
    "descriptionHint": "Sem números de telefone nem emails: a conversa fica na Ntizo até a reserva estar paga.",
    "neededByLabel": "Até quando precisa",
    "optional": "opcional",
    "photosLabel": "Fotos",
    "photosHint": "até 5 · JPEG, PNG, WebP ou PDF · 10 MB cada",
    "photosAction": "Juntar fotos",
    "addressLegend": "Onde é o trabalho",
    "addressNote": "O prestador vê o bairro e a cidade. A rua exacta só aparece quando a reserva estiver confirmada.",
    "addressAddAction": "Adicionar outra morada",
    "addressLoadError": "Não foi possível carregar as suas moradas.",
    "retry": "Tentar outra vez",
    "submit": "Enviar pedido",
    "cancel": "Cancelar",
    "railWho": "Quem responde",
    "verified": "Verificado",
    "ratingAndJobs": "{{rating}} ★ · {{jobs}} trabalhos",
    "railPromise": "Comprometem-se a responder em {{hours}} horas. Se não responderem, o pedido expira e avisamos.",
    "railNextTitle": "O que acontece a seguir",
    "step1Title": "Recebe uma proposta",
    "step1Body": "Preço, data, hora e duração, com uma nota do prestador.",
    "step2Title": "Aceita ou recusa",
    "step2Body": "Sem compromisso. Pode conversar antes de decidir.",
    "step3Title": "Paga por M-Pesa",
    "step3Body": "Só ao aceitar. A reserva fica confirmada quando o pagamento entrar.",
    "railFooter": "A Ntizo não acrescenta nada por cima: o valor da proposta é o que paga.",
    "errorDescriptionRequired": "Escreva o que precisa antes de enviar.",
    "errorAddressRequired": "Escolha onde é o trabalho.",
    "errorContact": "Tire o número de telefone ou o email do texto. A conversa fica na Ntizo até a reserva estar paga.",
    "errorAlreadyOpen": "Já tem um orçamento em aberto para este serviço.",
    "errorNotQuotable": "Este serviço deixou de aceitar pedidos de orçamento.",
    "errorGeneric": "Não foi possível enviar o pedido. Tente outra vez."
  },
  "detail": {
    "back": "Os meus orçamentos",
    "loadError": "Não foi possível carregar este orçamento.",
    "notFoundTitle": "Este orçamento não existe",
    "notFoundBody": "Pode ter sido retirado, ou o endereço está errado.",
    "memberDoes": "{{name}} faz o trabalho",
    "durationHours": "{{count}} horas",
    "durationHours_one": "{{count}} hora",
    "durationMinutes": "{{count}} minutos",
    "validUntil": "Válida até {{when}}",
    "accept": "Aceitar e pagar {{amount}}",
    "reject": "Recusar",
    "chat": "Conversar",
    "withdraw": "Retirar o pedido",
    "seeBooking": "Ver a reserva",
    "waitingTitle": "À espera da proposta",
    "waitingBody": "{{provider}} tem até {{when}} para responder. Avisamos assim que houver resposta.",
    "closedTitle": "Este orçamento terminou",
    "yourRequest": "O seu pedido",
    "neededByLabel": "Até quando",
    "whereLabel": "Onde",
    "photosLabel": "Fotos",
    "historyTitle": "Antes desta proposta",
    "supersededPrice": "Proposta anterior: {{price}}, {{when}}",
    "supersededBy": "Substituída pelo prestador a {{when}}.",
    "requestSent": "Pedido enviado",
    "respondByWas": "{{provider}} tinha até {{when}} para responder.",
    "railWho": "Quem propõe",
    "railProgress": "Como vai isto",
    "stepRequested": "Pedido enviado",
    "stepProposed": "Proposta recebida",
    "stepProposedRevised": "revista {{count}} vezes",
    "stepProposedRevised_one": "revista uma vez",
    "stepDecision": "A sua decisão",
    "stepPayment": "Pagamento por M-Pesa",
    "stepPaymentBody": "ao aceitar, recebe o pedido no telemóvel",
    "stepConfirmed": "Reserva confirmada",
    "stepConfirmedBody": "a vaga fica sua",
    "railFooter": "Aceitar cria a reserva e envia o pedido M-Pesa. Tem 15 minutos para confirmar no telemóvel; se não confirmar, a vaga é libertada e o prestador é avisado.",
    "movedOn": "Este orçamento mudou entretanto. Voltámos a carregá-lo."
  },
  "accept": {
    "back": "Proposta de {{provider}}",
    "title": "Aceitar a proposta",
    "lead": "Nada é cobrado sem o seu PIN. Ao aceitar, recebe um pedido M-Pesa no telemóvel e tem 15 minutos para o confirmar.",
    "service": "Serviço",
    "provider": "Prestador",
    "when": "Quando",
    "where": "Onde",
    "includes": "Inclui",
    "total": "Total a pagar",
    "phoneLead": "Recebe o pedido de pagamento em",
    "phoneChange": "Alterar",
    "phoneLabel": "Número M-Pesa",
    "phoneHint": "Tem de ser um número M-Pesa activo, com saldo para {{amount}}.",
    "phoneRequired": "Escreva o número que recebe o pedido M-Pesa.",
    "phoneInvalid": "Este número não parece válido.",
    "phoneNotVodacom": "O M-Pesa só funciona em números Vodacom (84 ou 85).",
    "countrySearchPlaceholder": "Procurar país",
    "countryNoResults": "Nenhum país encontrado",
    "countrySelectLabel": "País",
    "submit": "Aceitar e pagar {{amount}}",
    "cancel": "Voltar",
    "nextTitle": "O que acontece a seguir",
    "next1Title": "A reserva é criada",
    "next1Body": "A vaga fica reservada para si desde já.",
    "next2Title": "Chega o pedido M-Pesa",
    "next2Body": "No minuto seguinte, no número acima. Introduz o PIN.",
    "next3Title": "Confirmada",
    "next3Body": "O prestador é avisado e vê a sua morada completa.",
    "nextFooter": "Se o pedido não chegar, pode voltar a pedi-lo a partir da reserva com «Pagar agora». Passados 15 minutos sem pagamento a vaga é libertada e o prestador é avisado.",
    "slotTakenTitle": "Essa hora deixou de estar livre",
    "slotTakenBody": "Pedimos a {{provider}} uma nova proposta. Avisamos assim que houver resposta.",
    "slotTakenAction": "Voltar ao orçamento",
    "errorLapsed": "Esta proposta caducou. Peça uma nova ao prestador.",
    "errorMoved": "Este orçamento mudou entretanto. Volte a abri-lo para ver o que mudou.",
    "errorAddressRequired": "Escolha onde é o trabalho.",
    "errorGeneric": "Não foi possível aceitar a proposta. Tente outra vez."
  },
  "close": {
    "rejectTitle": "Recusar esta proposta?",
    "rejectBody": "{{provider}} fica a saber já, com o motivo. Pode juntar uma nota ou um ficheiro se ajudar a explicar.",
    "withdrawTitle": "Retirar este pedido?",
    "withdrawBody": "{{provider}} fica a saber que já não precisa. Pode juntar uma nota se quiser explicar.",
    "declineTitle": "Recusar este pedido?",
    "declineBody": "{{customer}} fica a saber já, com o motivo. Pode juntar uma nota ou um ficheiro se ajudar a explicar.",
    "reasonLegend": "Motivo",
    "noteLabel": "Nota",
    "optional": "opcional",
    "fileAction": "Juntar ficheiro",
    "keep": "Manter",
    "confirmReject": "Recusar proposta",
    "confirmWithdraw": "Retirar pedido",
    "confirmDecline": "Recusar pedido",
    "reason": {
      "not_available": "Não tenho disponibilidade",
      "cannot_perform": "Não faço este trabalho",
      "outside_area": "Fora da minha zona",
      "too_expensive": "Está acima do meu orçamento",
      "wrong_time": "A data não me serve",
      "found_elsewhere": "Já resolvi de outra maneira",
      "other": "Outro"
    },
    "errorMoved": "Isto mudou entretanto. Voltámos a carregar.",
    "errorContact": "Tire o número de telefone ou o email da nota.",
    "errorGeneric": "Não foi possível concluir. Tente outra vez."
  },
  "provider": {
    "title": "Orçamentos",
    "blurb": "{{count}} por responder · o mais antigo há {{oldest}}",
    "blurbNone": "Nada à espera de resposta.",
    "tab": { "toAnswer": "Por responder", "waiting": "À espera do cliente", "history": "Histórico" },
    "column": { "customer": "Cliente", "service": "Serviço", "status": "Estado", "price": "Preço" },
    "emptyTitle": "Sem pedidos de orçamento",
    "emptyText": "Marque um serviço como «sob orçamento» e os pedidos aparecem aqui.",
    "noMatchesTitle": "Nada nesta lista",
    "noMatchesText": "Experimente outro separador.",
    "receives": "recebe {{amount}}",
    "photos": "{{count}} fotos",
    "photos_one": "{{count}} foto",
    "noPhotos": "sem fotos",
    "neededBy": "até {{when}}",
    "noDeadline": "sem prazo",
    "more": "Mais",
    "loadError": "Não foi possível carregar os orçamentos.",
    "back": "Orçamentos",
    "notFoundTitle": "Este orçamento não existe",
    "notFoundBody": "Pode ter sido retirado, ou não é deste espaço.",
    "chatWith": "Conversar com {{name}}",
    "requestTitle": "O pedido",
    "neededByLabel": "Até quando",
    "whereLabel": "Onde",
    "whereNote": "A rua exacta aparece quando a reserva estiver confirmada",
    "whoAsks": "Quem pede",
    "completedBookings": "{{count}} reservas concluídas na Ntizo",
    "completedBookings_one": "{{count}} reserva concluída na Ntizo",
    "completedBookings_zero": "primeira vez na Ntizo",
    "historyTitle": "Historial",
    "requestReceived": "Pedido recebido",
    "responseWindow": "Prazo de resposta de {{hours}} h, definido no serviço.",
    "movedOn": "Este pedido mudou entretanto. Voltámos a carregá-lo."
  },
  "propose": {
    "title": "A sua proposta",
    "titleRevise": "Rever a proposta",
    "priceLabel": "Preço para o cliente",
    "customerPays": "O cliente paga",
    "commission": "Comissão Ntizo ({{rate}})",
    "receives": "Recebe",
    "dateLabel": "Data",
    "timeLabel": "Hora",
    "durationLabel": "Duração",
    "memberLabel": "Quem faz o trabalho",
    "memberSelf": "{{name}} (eu)",
    "noteLabel": "Nota para o cliente",
    "optional": "opcional",
    "notePlaceholder": "O que está incluído, o que fica de fora, o que combina no local.",
    "attachmentsLabel": "Anexos",
    "attachmentsLimit": "até 5",
    "attachmentsAction": "Juntar ficheiro",
    "attachmentsHint": "orçamento em PDF, fotos de trabalhos parecidos",
    "validityNote": "A proposta fica válida {{hours}} horas. Pode revê-la enquanto o cliente não decidir; a anterior fica no historial.",
    "submit": "Enviar proposta",
    "submitRevise": "Enviar nova proposta",
    "reviseAction": "Rever proposta",
    "decline": "Recusar pedido",
    "sentTitle": "Proposta enviada",
    "errorPriceRequired": "Escreva o preço.",
    "errorPriceBelowMinimum": "O preço está abaixo do mínimo da plataforma.",
    "errorDateRequired": "Escolha a data e a hora.",
    "errorStartsInPast": "Escolha uma data no futuro.",
    "errorDurationInvalid": "A duração tem de ser entre 1 minuto e 24 horas.",
    "errorMemberRequired": "Escolha quem faz o trabalho.",
    "errorMemberCannotPerform": "Esta pessoa não faz este serviço.",
    "errorSlotOverlap": "Essa hora choca com outra reserva desta pessoa.",
    "errorContact": "Tire o número de telefone ou o email da nota.",
    "errorMoved": "Este pedido mudou entretanto. Voltámos a carregá-lo.",
    "errorGeneric": "Não foi possível enviar a proposta. Tente outra vez."
  },
  "attachment": {
    "remove": "Remover {{name}}",
    "download": "Transferir {{name}}",
    "downloadFailed": "Não foi possível transferir este ficheiro.",
    "tooMany": "No máximo {{max}} ficheiros."
  },
  "entry": {
    "price": "Sob orçamento",
    "respondsIn": "responde em {{hours}} h",
    "panelTitle": "Sob orçamento",
    "panelBody": "O preço depende do trabalho. Conte o que precisa e {{provider}} responde com um valor, uma data e a duração, sem compromisso da sua parte.",
    "action": "Pedir orçamento",
    "message": "Enviar mensagem"
  }
}
```

- [ ] **Step 2: Write en-US, the placeholder reference**

`i18n-parity.test.ts` compares every locale's `{{placeholders}}` against **en-US**, so this file
must exist with the identical key tree and identical placeholder names. Translate every leaf of the
pt-MZ file above into English, keeping each `{{name}}` byte-identical. Examples to fix the register
(plain, second person, no exclamation marks), the rest follow the same voice:

```json
{
  "list": {
    "title": "My quotes",
    "blurb": "What you asked for, what has an answer, and what is still on the clock.",
    "tab": { "open": "Open", "history": "History" }
  },
  "entry": {
    "price": "By quote",
    "respondsIn": "answers within {{hours}} h",
    "action": "Ask for a quote"
  }
}
```

- [ ] **Step 3: Write the remaining six locales**

`pt-PT`, `es-ES`, `de-DE`, `fr-FR`, `it-IT`, `nl-NL`. Translate every leaf from **pt-MZ**, keeping
the key tree and every `{{placeholder}}` byte-identical. pt-PT differs from pt-MZ only where
Mozambican usage does: keep "bairro" in pt-MZ, use "zona" in pt-PT; keep M-Pesa references in all
of them, because the payment method does not change with the reader's language.

- [ ] **Step 4: Add the nav label to `common.json` ×8**

pt-MZ gets `"quotes": "Orçamentos"` beside the existing `"myBookings"`. en-US gets
`"quotes": "Quotes"`. The other six take their own translation. Keep alphabetical position
irrelevant — insert next to `myBookings`, where the menu shows it.

- [ ] **Step 5: Register the namespace in `i18n.ts`**

Three edits. (a) eight imports beside the existing `bookings` ones:

```ts
import deDEQuotes from "@/shared/locales/de-DE/quotes.json";
import enUSQuotes from "@/shared/locales/en-US/quotes.json";
import esESQuotes from "@/shared/locales/es-ES/quotes.json";
import frFRQuotes from "@/shared/locales/fr-FR/quotes.json";
import itITQuotes from "@/shared/locales/it-IT/quotes.json";
import nlNLQuotes from "@/shared/locales/nl-NL/quotes.json";
import ptMZQuotes from "@/shared/locales/pt-MZ/quotes.json";
import ptPTQuotes from "@/shared/locales/pt-PT/quotes.json";
```

(b) one line in each of the eight `resources` blocks, beside `bookings:` —
`quotes: ptMZQuotes,` in the pt-MZ block and so on. (c) `"quotes"` appended to the `ns: [...]`
array in `i18n.init()`.

- [ ] **Step 6: Add `quotes` to the `NAMESPACES` map in `locales.test.ts`**

Eight imports and one entry, exactly mirroring the `bookings` entry above it:

```ts
quotes: {
  "de-DE": deDEQuotes, "en-US": enUSQuotes, "es-ES": esESQuotes, "fr-FR": frFRQuotes,
  "it-IT": itITQuotes, "nl-NL": nlNLQuotes, "pt-MZ": ptMZQuotes, "pt-PT": ptPTQuotes,
},
```

- [ ] **Step 7: Run both gates**

```bash
cd apps/frontend/web
bunx vitest run src/shared/locales/__tests__/locales.test.ts src/shared/lib/__tests__/i18n-parity.test.ts
```

Expected: PASS. A failure names the exact locale and dotted path that differs — fix the JSON, never
the test. If a locale is missing a plural form the reference has (`_one`, `_zero`), add it: i18next
plural suffixes are leaf paths like any other and the parity test counts them.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/src/shared/locales apps/frontend/web/src/shared/lib/i18n.ts
git commit -m "feat(web): the quotes namespace, in all eight languages"
```

---

### Task 2: Plumbing three shipped files can no longer do without

Three small, independent edits that later tasks depend on. Batched into one task because none of
them is worth its own review pass, and all three are pure preparation.

**Files:**
- Modify: `apps/frontend/web/eslint.config.js`
- Create: `apps/frontend/web/src/shared/domain/address-input.ts`
- Modify: `apps/frontend/web/src/features/checkout/ui/confirm-page.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/data/service-detail.repository.ts`
- Test: `apps/frontend/web/src/features/directory/services/data/__tests__/service-detail.repository.test.ts`,
  `apps/frontend/web/src/shared/domain/__tests__/address-input.test.ts` (create)

**Interfaces:**
- Produces: `toAddressInput(address: AddressDTO): QuoteAddressInput` and the `QuoteAddressInput`
  type, used by Task 8 (`quoteRequest`) and Task 11 (`quoteAccept`); `quoteForm` on the service
  detail query, used by Tasks 7 and 8.

- [ ] **Step 1: Teach the boundaries config about `provider/quotes`**

`src/features/*/data/**` has a single-segment `*`, so `src/features/provider/quotes/data/**` matches
nothing and `boundaries/no-unknown-files: error` rejects every file in it. Add one line to each of
the four element patterns in `apps/frontend/web/eslint.config.js`, beside the existing
`provider/bookings` line:

```js
// type: "domain"
"src/features/provider/quotes/domain/**",
// type: "data"
"src/features/provider/quotes/data/**",
// type: "viewmodel"
"src/features/provider/quotes/viewmodel/**",
// type: "ui"
"src/features/provider/quotes/ui/**",
```

- [ ] **Step 2: Write the failing test for the shared address mapper**

Create `apps/frontend/web/src/shared/domain/__tests__/address-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AddressDTO } from "@ntizo/shared";
import { toAddressInput } from "@/shared/domain/address-input";

const base: AddressDTO = {
  id: "a1", label: "Casa", country: "MZ", city: "Maputo", district: "Bairro Central",
  line1: "Av. Julius Nyerere 1234", line2: null, postalCode: null, directions: null,
  latitude: null, longitude: null, isDefault: true,
};

describe("toAddressInput", () => {
  it("joins line1 and line2, because a flat number lives in the second line", () => {
    expect(toAddressInput({ ...base, line2: "3.º andar" }).line).toBe(
      "Av. Julius Nyerere 1234, 3.º andar",
    );
  });

  it("omits an absent second line rather than leaving a trailing comma", () => {
    expect(toAddressInput(base).line).toBe("Av. Julius Nyerere 1234");
  });

  it("parses stored coordinates, which cross the wire as strings", () => {
    const out = toAddressInput({ ...base, latitude: "-25.9692", longitude: "32.5732" });
    expect(out.lat).toBe(-25.9692);
    expect(out.lng).toBe(32.5732);
  });

  it("turns an unparseable coordinate into null rather than NaN", () => {
    expect(toAddressInput({ ...base, latitude: "not a number" }).lat).toBeNull();
  });

  it("carries the label, city, district and directions through untouched", () => {
    const out = toAddressInput({ ...base, directions: "Portão azul" });
    expect(out).toMatchObject({
      label: "Casa", city: "Maputo", district: "Bairro Central", directions: "Portão azul",
    });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/shared/domain/__tests__/address-input.test.ts
```

Expected: FAIL — cannot resolve `@/shared/domain/address-input`.

- [ ] **Step 4: Write the mapper**

Create `apps/frontend/web/src/shared/domain/address-input.ts`, moving the two functions out of
`confirm-page.tsx` unchanged and keeping their reasoning:

```ts
import type { AddressDTO } from "@ntizo/shared";

/**
 * One saved address in the shape every write that takes an address expects:
 * `booking.submit`, `quote.request` and `quote.accept` all declare the same
 * seven fields.
 *
 * `line1` and `line2` are joined rather than one being dropped: a flat or an
 * apartment number lives in the second line, and a provider sent to the
 * building without it is a provider standing outside the right door.
 *
 * The booking and the quote each keep this as a snapshot, so the customer
 * correcting their street next March does not move where the provider went
 * last week — which is why the components travel by value and no address id
 * is sent.
 */
export interface AddressInput {
  label: string;
  line: string;
  city: string;
  district?: string | null;
  directions?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/**
 * A stored coordinate as a number, or `null`.
 *
 * `AddressDTO` carries latitude and longitude as strings, because Postgres
 * `numeric` crosses the wire as one and rounding it to a float at the read
 * model would be losing precision the column was chosen to keep. The mutations
 * take numbers, so the conversion happens here — and a value that does not
 * parse becomes `null` rather than `NaN`, which would serialise to JSON as
 * `null` anyway but only after passing through arithmetic as a number.
 */
function coordinate(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function toAddressInput(address: AddressDTO): AddressInput {
  return {
    label: address.label,
    line: [address.line1, address.line2].filter(Boolean).join(", "),
    city: address.city,
    district: address.district,
    directions: address.directions,
    lat: coordinate(address.latitude),
    lng: coordinate(address.longitude),
  };
}
```

- [ ] **Step 5: Point `confirm-page.tsx` at it**

Delete the local `coordinate` and `toSubmitAddress` from
`apps/frontend/web/src/features/checkout/ui/confirm-page.tsx` and import instead:

```ts
import { toAddressInput } from "@/shared/domain/address-input";
```

Replace every `toSubmitAddress(` call with `toAddressInput(`. `SubmitBookingAddress` and
`AddressInput` are structurally identical, so the existing `submitBooking` signature still accepts
it; leave `SubmitBookingAddress` where it is rather than widening the checkout repository in this
task.

- [ ] **Step 6: Add `quoteForm` to the service detail selection**

In `apps/frontend/web/src/features/directory/services/data/service-detail.repository.ts`, append to
`SERVICE_DETAIL_FIELDS`:

```
  quoteForm { responseHours askDeadline askPhotos askLocation intro }
```

Then extend `service-detail.repository.test.ts` with:

```ts
it("asks for the quote form, which the request page and the service panel both read", () => {
  expect(SERVICE_DETAIL_FIELDS).toContain("quoteForm { responseHours askDeadline askPhotos askLocation intro }");
});
```

- [ ] **Step 7: Run the affected suites and the linter**

```bash
cd apps/frontend/web
bunx vitest run src/shared/domain src/features/checkout/ui/__tests__/confirm-page.test.tsx \
  src/features/directory/services/data/__tests__/service-detail.repository.test.ts
bun run lint
bun run typecheck
```

Expected: all PASS. `typecheck` matters here — `quoteForm` is `nullable()` on the read model, so
every consumer must handle `null`.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/eslint.config.js apps/frontend/web/src/shared/domain \
  apps/frontend/web/src/features/checkout/ui/confirm-page.tsx \
  apps/frontend/web/src/features/directory/services/data
git commit -m "refactor(web): one address mapper for every write that takes an address, and the service query finally asks for the quote form"
```

---

### Task 3: The quote domain — status, clock, money split

Pure functions, no React, no network. Every screen in this plan reads them, so they come before any
page. The two files split by question: `status.ts` answers "what does this quote say and what can
be done to it", `money-split.ts` answers "what does the provider take home".

**Files:**
- Create: `apps/frontend/web/src/features/quotes/domain/status.ts`
- Create: `apps/frontend/web/src/features/quotes/domain/money-split.ts`
- Test: `apps/frontend/web/src/features/quotes/domain/__tests__/status.test.ts`
- Test: `apps/frontend/web/src/features/quotes/domain/__tests__/money-split.test.ts`

**Interfaces:**
- Consumes: `QUOTE_STATUSES`, `QuoteStatus`, `QuoteExpiredCause` from `@ntizo/shared`.
- Produces:
  ```ts
  QUOTES_PAGE_SIZE: 20
  type QuoteTone = "waiting" | "yours" | "done" | "refused" | "gone"
  type QuoteClock =
    | { kind: "respondBy"; at: string } | { kind: "decideBy"; at: string }
    | { kind: "becameBooking" } | { kind: "closedReason"; reason: string }
    | { kind: "expired"; cause: QuoteExpiredCause; at: string } | { kind: "none" }
  customerTone(status: QuoteStatus): QuoteTone
  providerTone(status: QuoteStatus): QuoteTone
  TONE_CLASS: Record<QuoteTone, string>
  clockOf(quote: { status; expiresAt; expiredCause; requestedAt; proposal }): QuoteClock
  coarseDuration(ms: number): { unit: "min" | "h" | "d"; count: number } | null
  revisionCount(proposals: { supersededCause: string | null }[]): number
  canAccept(q), canReject(q), canWithdraw(q), canPropose(q), canDecline(q): boolean
  commissionMinorOf(priceMinor: number, commissionBps: number): number
  payoutMinorOf(priceMinor: number, commissionBps: number): number
  ```

- [ ] **Step 1: Write the failing test for tone and actions**

Create `apps/frontend/web/src/features/quotes/domain/__tests__/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canAccept, canDecline, canPropose, canReject, canWithdraw,
  clockOf, coarseDuration, customerTone, providerTone, revisionCount,
} from "@/features/quotes/domain/status";

describe("tone", () => {
  it("reads REQUESTED as waiting for the customer and as the provider's move", () => {
    expect(customerTone("REQUESTED")).toBe("waiting");
    expect(providerTone("REQUESTED")).toBe("yours");
  });

  it("reads PROPOSED the other way round", () => {
    expect(customerTone("PROPOSED")).toBe("yours");
    expect(providerTone("PROPOSED")).toBe("waiting");
  });

  it("agrees on every terminal status, because those are nobody's turn", () => {
    for (const status of ["ACCEPTED", "DECLINED", "REJECTED", "WITHDRAWN", "EXPIRED"] as const) {
      expect(customerTone(status)).toBe(providerTone(status));
    }
    expect(customerTone("ACCEPTED")).toBe("done");
    expect(customerTone("DECLINED")).toBe("refused");
    expect(customerTone("REJECTED")).toBe("refused");
    expect(customerTone("WITHDRAWN")).toBe("gone");
    expect(customerTone("EXPIRED")).toBe("gone");
  });
});

describe("actions", () => {
  const at = (status: string) => ({ status }) as never;

  it("lets the customer accept and reject only a live proposal", () => {
    expect(canAccept({ status: "PROPOSED", proposal: { id: "p1" } } as never)).toBe(true);
    expect(canAccept({ status: "PROPOSED", proposal: null } as never)).toBe(false);
    expect(canAccept({ status: "REQUESTED", proposal: null } as never)).toBe(false);
    expect(canReject(at("PROPOSED"))).toBe(true);
    expect(canReject(at("REQUESTED"))).toBe(false);
  });

  it("lets the customer withdraw only before a proposal exists", () => {
    expect(canWithdraw(at("REQUESTED"))).toBe(true);
    expect(canWithdraw(at("PROPOSED"))).toBe(false);
  });

  it("lets the provider answer while the quote is open, revision included", () => {
    expect(canPropose(at("REQUESTED"))).toBe(true);
    expect(canPropose(at("PROPOSED"))).toBe(true);
    expect(canPropose(at("ACCEPTED"))).toBe(false);
    expect(canDecline(at("REQUESTED"))).toBe(true);
    expect(canDecline(at("PROPOSED"))).toBe(true);
    expect(canDecline(at("EXPIRED"))).toBe(false);
  });
});

describe("clockOf", () => {
  const base = { expiresAt: "2026-09-05T10:12:00.000Z", expiredCause: null, closedReason: null,
                 requestedAt: "2026-09-03T10:12:00.000Z", proposal: null };

  it("points a REQUESTED quote at the provider's deadline", () => {
    expect(clockOf({ ...base, status: "REQUESTED" } as never))
      .toEqual({ kind: "respondBy", at: "2026-09-05T10:12:00.000Z" });
  });

  it("points a PROPOSED quote at the proposal's validity, not the quote's row", () => {
    expect(clockOf({ ...base, status: "PROPOSED",
      expiresAt: "2026-09-07T16:40:00.000Z",
      proposal: { validUntil: "2026-09-07T16:40:00.000Z" } } as never))
      .toEqual({ kind: "decideBy", at: "2026-09-07T16:40:00.000Z" });
  });

  it("says an accepted quote became a booking rather than repeating a deadline", () => {
    expect(clockOf({ ...base, status: "ACCEPTED" } as never)).toEqual({ kind: "becameBooking" });
  });

  it("carries the cause of an expiry, so nobody has to guess who dropped it", () => {
    expect(clockOf({ ...base, status: "EXPIRED", expiredCause: "provider_did_not_respond" } as never))
      .toEqual({ kind: "expired", cause: "provider_did_not_respond", at: "2026-09-05T10:12:00.000Z" });
  });

  it("says why a refused quote closed, because there is no timestamp for when", () => {
    expect(clockOf({ ...base, status: "DECLINED", closedReason: "outside_area" } as never))
      .toEqual({ kind: "closedReason", reason: "outside_area" });
    expect(clockOf({ ...base, status: "WITHDRAWN", closedReason: "other" } as never))
      .toEqual({ kind: "closedReason", reason: "other" });
  });

  it("falls back to nothing rather than inventing a date it does not have", () => {
    expect(clockOf({ ...base, status: "EXPIRED", expiredCause: null, expiresAt: null } as never))
      .toEqual({ kind: "none" });
    expect(clockOf({ ...base, status: "REJECTED", closedReason: null } as never))
      .toEqual({ kind: "none" });
  });
});

describe("coarseDuration", () => {
  it("counts whole minutes under an hour", () => {
    expect(coarseDuration(45 * 60_000)).toEqual({ unit: "min", count: 45 });
  });

  it("counts whole hours up to two days, which is how the mockup reads a 48 h clock", () => {
    expect(coarseDuration(22 * 3_600_000)).toEqual({ unit: "h", count: 22 });
    expect(coarseDuration(26 * 3_600_000)).toEqual({ unit: "h", count: 26 });
  });

  it("switches to days past 48 hours", () => {
    expect(coarseDuration(50 * 3_600_000)).toEqual({ unit: "d", count: 2 });
  });

  it("returns null for a span that has already run out", () => {
    expect(coarseDuration(0)).toBeNull();
    expect(coarseDuration(-1)).toBeNull();
  });
});

describe("revisionCount", () => {
  it("counts only proposals the provider replaced, never one a taken slot killed", () => {
    expect(revisionCount([
      { supersededCause: "revised" }, { supersededCause: "slot_taken" }, { supersededCause: null },
    ])).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes/domain
```

Expected: FAIL — cannot resolve `@/features/quotes/domain/status`.

- [ ] **Step 3: Write `status.ts`**

```ts
import type { QuoteExpiredCause, QuoteStatus } from "@ntizo/shared";

/** How many rows a quotes list asks for at a time. */
export const QUOTES_PAGE_SIZE = 20;

/**
 * Whose turn it is, as a colour.
 *
 * Amber is "the other side owes you"; navy is "your move". The same status
 * therefore reads differently on the two sides, which is the whole reason
 * there are two functions instead of one map — a customer looking at
 * `REQUESTED` is waiting on the provider, and the provider looking at that
 * same row is the one who owes an answer.
 */
export type QuoteTone = "waiting" | "yours" | "done" | "refused" | "gone";

export function customerTone(status: QuoteStatus): QuoteTone {
  switch (status) {
    case "REQUESTED": return "waiting";
    case "PROPOSED": return "yours";
    case "ACCEPTED": return "done";
    case "DECLINED":
    case "REJECTED": return "refused";
    case "WITHDRAWN":
    case "EXPIRED": return "gone";
  }
}

export function providerTone(status: QuoteStatus): QuoteTone {
  switch (status) {
    case "REQUESTED": return "yours";
    case "PROPOSED": return "waiting";
    case "ACCEPTED": return "done";
    case "DECLINED":
    case "REJECTED": return "refused";
    case "WITHDRAWN":
    case "EXPIRED": return "gone";
  }
}

/** The dot's colour. Words come from the locale, never from here. */
export const TONE_CLASS: Record<QuoteTone, string> = {
  waiting: "bg-[var(--color-warning)]",
  yours: "bg-[var(--color-primary)]",
  done: "bg-[var(--color-success)]",
  refused: "bg-[var(--color-destructive)]",
  gone: "bg-[var(--color-muted-foreground)]",
};

/**
 * What the clock line under the status says.
 *
 * A shape rather than a string, because the two sides word the same instant
 * differently and only the component knows which locale key it wants.
 */
export type QuoteClock =
  | { kind: "respondBy"; at: string }
  | { kind: "decideBy"; at: string }
  | { kind: "becameBooking" }
  | { kind: "closedReason"; reason: string }
  | { kind: "expired"; cause: QuoteExpiredCause; at: string }
  | { kind: "none" };

interface ClockSource {
  status: QuoteStatus;
  expiresAt: string | null;
  closedReason: string | null;
  expiredCause: QuoteExpiredCause | null;
  requestedAt: string;
  proposal: { validUntil: string } | null;
}

/**
 * `expires_at` carries two different clocks depending on the status — the
 * provider's window to answer while `REQUESTED`, the proposal's validity while
 * `PROPOSED` — which is exactly why the caller must not read it raw.
 */
export function clockOf(quote: ClockSource): QuoteClock {
  switch (quote.status) {
    case "REQUESTED":
      return quote.expiresAt === null ? { kind: "none" } : { kind: "respondBy", at: quote.expiresAt };
    case "PROPOSED": {
      // The proposal's own validity is the authority; the quote row mirrors it.
      const at = quote.proposal?.validUntil ?? quote.expiresAt;
      return at === null ? { kind: "none" } : { kind: "decideBy", at };
    }
    case "ACCEPTED":
      return { kind: "becameBooking" };
    case "EXPIRED":
      return quote.expiredCause === null || quote.expiresAt === null
        ? { kind: "none" }
        : { kind: "expired", cause: quote.expiredCause, at: quote.expiresAt };
    case "DECLINED":
    case "REJECTED":
    case "WITHDRAWN":
      // No closing timestamp exists on the read model — `expiresAt` on a
      // closed quote is the deadline that was still running, not the moment
      // it closed. The reason is what there is, so the reason is what is
      // said. See the Deviations section.
      return quote.closedReason === null
        ? { kind: "none" }
        : { kind: "closedReason", reason: quote.closedReason };
  }
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

/**
 * A span rounded down to the unit a person would say out loud.
 *
 * Quote clocks run in days, not minutes, so the checkout countdown's `MM:SS`
 * is the wrong instrument. Hours stay hours up to two days — "faltam 26 h"
 * is more useful than "faltam 1 dia" when the deadline is tomorrow morning.
 * `null` means the span has run out, and the caller says so in its own words.
 */
export function coarseDuration(ms: number): { unit: "min" | "h" | "d"; count: number } | null {
  if (ms <= 0) return null;
  if (ms < HOUR) return { unit: "min", count: Math.floor(ms / MINUTE) };
  if (ms < 48 * HOUR) return { unit: "h", count: Math.floor(ms / HOUR) };
  return { unit: "d", count: Math.floor(ms / (24 * HOUR)) };
}

/** How many times the provider replaced their own price. A slot-taken supersession is not a revision. */
export function revisionCount(proposals: { supersededCause: string | null }[]): number {
  return proposals.filter((p) => p.supersededCause === "revised").length;
}

export function canAccept(q: { status: QuoteStatus; proposal: unknown }): boolean {
  return q.status === "PROPOSED" && q.proposal !== null;
}
export function canReject(q: { status: QuoteStatus }): boolean { return q.status === "PROPOSED"; }
export function canWithdraw(q: { status: QuoteStatus }): boolean { return q.status === "REQUESTED"; }
export function canPropose(q: { status: QuoteStatus }): boolean {
  return q.status === "REQUESTED" || q.status === "PROPOSED";
}
export function canDecline(q: { status: QuoteStatus }): boolean {
  return q.status === "REQUESTED" || q.status === "PROPOSED";
}
```

- [ ] **Step 4: Write the failing test for the money split**

Create `apps/frontend/web/src/features/quotes/domain/__tests__/money-split.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { commissionMinorOf, payoutMinorOf } from "@/features/quotes/domain/money-split";

describe("the split the provider is deciding on", () => {
  it("takes ten per cent of 9 800 MZN exactly as the booking does", () => {
    expect(commissionMinorOf(980_000, 1000)).toBe(98_000);
    expect(payoutMinorOf(980_000, 1000)).toBe(882_000);
  });

  it("rounds half away from zero, which is what Math.round does and what the booking stores", () => {
    // 1 cent at 12.5% is 0.125 -> 0; 3 cents is 0.375 -> 0; 5 cents is 0.625 -> 1.
    expect(commissionMinorOf(1, 1250)).toBe(0);
    expect(commissionMinorOf(3, 1250)).toBe(0);
    expect(commissionMinorOf(5, 1250)).toBe(1);
  });

  it("gives the whole price away at 100% and nothing at 0%", () => {
    expect(payoutMinorOf(500_00, 10_000)).toBe(0);
    expect(commissionMinorOf(500_00, 0)).toBe(0);
  });

  it("never leaves a cent unaccounted for", () => {
    for (const price of [1, 7, 99, 1234, 980_000]) {
      expect(commissionMinorOf(price, 1000) + payoutMinorOf(price, 1000)).toBe(price);
    }
  });
});
```

- [ ] **Step 5: Write `money-split.ts`**

```ts
/**
 * The provider's share of a price they have not sent yet.
 *
 * The proposal form has to show "recebe X" while the provider is still typing,
 * and the quote read model carries only `commissionBps` — there is no
 * `commissionMinor` to read, because no booking exists yet. So the arithmetic
 * happens here, and it is `booking.aggregate.ts`'s expression character for
 * character: `Math.round((priceMinor * commissionBps) / 10_000)`. Any other
 * rounding shows the provider one number and pays them another.
 */
const COMMISSION_BPS_MAX = 10_000;

export function commissionMinorOf(priceMinor: number, commissionBps: number): number {
  return Math.round((priceMinor * commissionBps) / COMMISSION_BPS_MAX);
}

export function payoutMinorOf(priceMinor: number, commissionBps: number): number {
  return priceMinor - commissionMinorOf(priceMinor, commissionBps);
}
```

- [ ] **Step 6: Run both suites**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes/domain
```

Expected: PASS, both files.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/quotes/domain
git commit -m "feat(web): the quote domain knows whose turn it is, which clock is running, and what the provider takes home"
```

---

### Task 4: The customer's data layer and viewmodel

Documents, query factories, mutations, and the hooks that wrap them. Nothing renders; the gate is a
repository test that pins the selection sets and the wire names, because those are what a silent
typo breaks.

**Files:**
- Create: `apps/frontend/web/src/features/quotes/data/quote.repository.ts`
- Create: `apps/frontend/web/src/features/quotes/viewmodel/use-my-quotes.ts`
- Test: `apps/frontend/web/src/features/quotes/data/__tests__/quote.repository.test.ts`

**Interfaces:**
- Consumes: `QUOTES_PAGE_SIZE` (Task 3), `AddressInput` (Task 2), `sessionGraphql` and
  `GraphqlError` from `@/shared/lib/graphql/session-graphql`.
- Produces:
  ```ts
  // data
  QUOTE_PROPOSAL_FIELDS, CUSTOMER_QUOTE_FIELDS, CUSTOMER_QUOTE_DETAIL_FIELDS: string
  myQuoteQueries.page({ tab, offset }), myQuoteQueries.detail(quoteId)
  requestQuote(input: RequestQuoteInput): Promise<{ quoteId: string; respondBy: string }>
  rejectQuote(input: { quoteId; reason; note?; attachments? }): Promise<{ applied: boolean }>
  withdrawQuote(input: { quoteId; note?; attachments? }): Promise<{ applied: boolean }>
  acceptQuote(input: { quoteId; address?: AddressInput | null }):
    Promise<{ bookingId: string; payBy: string }>
  type CustomerQuoteDTO, CustomerQuoteDetailDTO, CustomerQuotePageDTO, QuoteProposalDTO,
       QuoteAttachmentDTO, RequestQuoteInput
  // viewmodel
  useMyQuotes(input), useMyQuote(quoteId), useRequestQuote(), useCloseQuote(), useAcceptQuote()
  ```

- [ ] **Step 1: Write the failing repository test**

Create `apps/frontend/web/src/features/quotes/data/__tests__/quote.repository.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_QUOTE_DETAIL_FIELDS, CUSTOMER_QUOTE_FIELDS, QUOTE_PROPOSAL_FIELDS,
  acceptQuote, myQuoteQueries, rejectQuote, requestQuote, withdrawQuote,
} from "@/features/quotes/data/quote.repository";

const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));
vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

beforeEach(() => fakes.graphql.mockReset());

describe("the selection sets", () => {
  it("asks for every proposal field the detail page renders", () => {
    for (const field of ["priceMinor", "currency", "startsAt", "endsAt", "durationMinutes",
                         "memberFirstName", "note", "validUntil", "supersededAt", "supersededCause"]) {
      expect(QUOTE_PROPOSAL_FIELDS).toContain(field);
    }
  });

  it("asks the list for the provider, the clock and the booking it became", () => {
    for (const field of ["providerName", "providerSlug", "providerVerified",
                         "expiresAt", "expiredCause", "bookingId", "threadId", "timezone"]) {
      expect(CUSTOMER_QUOTE_FIELDS).toContain(field);
    }
  });

  it("asks the detail for the request, its history and the closing words", () => {
    for (const field of ["description", "neededBy", "requestAttachments", "proposals",
                         "closedReason", "closedNote", "closingAttachments"]) {
      expect(CUSTOMER_QUOTE_DETAIL_FIELDS).toContain(field);
    }
  });

  it("never asks for a customer phone or email, which the provider must not see either", () => {
    expect(CUSTOMER_QUOTE_DETAIL_FIELDS).not.toContain("phone");
    expect(CUSTOMER_QUOTE_DETAIL_FIELDS).not.toContain("email");
  });
});

describe("the page query", () => {
  it("keys on the tab and the offset, so two tabs do not share a cache entry", () => {
    expect(myQuoteQueries.page({ tab: "open", offset: 0 }).queryKey)
      .toEqual(["quotes", "mine", "open", 0]);
    expect(myQuoteQueries.page({ tab: "history", offset: 20 }).queryKey)
      .toEqual(["quotes", "mine", "history", 20]);
  });

  it("sends the page size the domain declares", async () => {
    fakes.graphql.mockResolvedValue({ quoteMine: { items: [], counts: { open: 0, history: 0 }, hasMore: false } });
    await myQuoteQueries.page({ tab: "open", offset: 40 }).queryFn!({} as never);
    expect(fakes.graphql).toHaveBeenCalledWith(expect.stringContaining("quoteMine"), {
      input: { tab: "open", limit: 20, offset: 40 },
    });
  });
});

describe("the writes", () => {
  it("sends a request without the optional fields it was not given", async () => {
    fakes.graphql.mockResolvedValue({ quoteRequest: { quoteId: "q1", respondBy: "2026-09-05T10:12:00.000Z" } });
    await requestQuote({ serviceId: "s1", description: "Dois aparelhos", locale: "pt-MZ" });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables).toEqual({ input: { serviceId: "s1", description: "Dois aparelhos", locale: "pt-MZ" } });
    expect(variables.input).not.toHaveProperty("neededBy");
    expect(variables.input).not.toHaveProperty("address");
  });

  it("sends the optional fields it was given", async () => {
    fakes.graphql.mockResolvedValue({ quoteRequest: { quoteId: "q1", respondBy: "x" } });
    await requestQuote({
      serviceId: "s1", description: "d", locale: "pt-MZ", neededBy: "2026-09-27",
      address: { label: "Casa", line: "Av. 1234", city: "Maputo", district: null,
                 directions: null, lat: null, lng: null },
      attachments: [{ storageKey: "k1" }],
    });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables.input.neededBy).toBe("2026-09-27");
    expect(variables.input.attachments).toEqual([{ storageKey: "k1" }]);
    expect(variables.input.address.city).toBe("Maputo");
  });

  it("reports a lost race as applied:false rather than throwing", async () => {
    fakes.graphql.mockResolvedValue({ quoteReject: { quoteId: "q1", applied: false } });
    await expect(rejectQuote({ quoteId: "q1", reason: "too_expensive" }))
      .resolves.toEqual({ applied: false });
  });

  it("withdraws without a reason, because there is no reason token for withdrawal", async () => {
    fakes.graphql.mockResolvedValue({ quoteWithdraw: { quoteId: "q1", applied: true } });
    await withdrawQuote({ quoteId: "q1", note: "Já resolvi" });
    const [, variables] = fakes.graphql.mock.calls[0]!;
    expect(variables.input).toEqual({ quoteId: "q1", note: "Já resolvi" });
  });

  it("returns the booking the acceptance created and the deadline to pay it", async () => {
    fakes.graphql.mockResolvedValue({ quoteAccept: { bookingId: "b1", payBy: "2026-09-07T17:00:00.000Z" } });
    await expect(acceptQuote({ quoteId: "q1" }))
      .resolves.toEqual({ bookingId: "b1", payBy: "2026-09-07T17:00:00.000Z" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes/data
```

Expected: FAIL — cannot resolve `@/features/quotes/data/quote.repository`.

- [ ] **Step 3: Write `quote.repository.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import type {
  CustomerQuoteTab, QuoteAttachmentStep, QuoteCustomerRejectReason, QuoteExpiredCause,
  QuoteStatus, QuoteSupersededCause,
} from "@ntizo/shared";
import { QUOTES_PAGE_SIZE } from "@/features/quotes/domain/status";
import type { AddressInput } from "@/shared/domain/address-input";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

export interface QuoteAttachmentDTO {
  id: string;
  step: QuoteAttachmentStep;
  proposalId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface QuoteProposalDTO {
  id: string;
  priceMinor: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  providerMemberId: string;
  memberFirstName: string;
  note: string | null;
  validUntil: string;
  createdAt: string;
  supersededAt: string | null;
  supersededCause: QuoteSupersededCause | null;
  attachments: QuoteAttachmentDTO[];
}

export interface CustomerQuoteDTO {
  id: string;
  status: QuoteStatus;
  serviceId: string;
  serviceName: string;
  providerId: string;
  timezone: string;
  // Not nullable on the read model: every quote gets a thread, and every
  // proposal gets a validity. The wire types them nullable because the field
  // kit emits every scalar nullable; the zod model is the runtime truth.
  threadId: string;
  expiresAt: string | null;
  expiredCause: QuoteExpiredCause | null;
  closedReason: string | null;
  bookingId: string | null;
  requestedAt: string;
  proposal: QuoteProposalDTO | null;
  providerName: string;
  providerSlug: string;
  providerVerified: boolean;
}

export interface CustomerQuoteDetailDTO extends CustomerQuoteDTO {
  description: string;
  neededBy: string | null;
  address: {
    label: string; line: string; city: string;
    district: string | null; directions: string | null;
  } | null;
  requestAttachments: QuoteAttachmentDTO[];
  proposals: QuoteProposalDTO[];
  closedNote: string | null;
  closingAttachments: QuoteAttachmentDTO[];
}

export interface CustomerQuotePageDTO {
  items: CustomerQuoteDTO[];
  counts: { open: number; history: number };
  hasMore: boolean;
}

/**
 * The selection sets, extracted so a test can assert what is and is not asked
 * for. The wire names are flat — the field kit collapses a nested schema key,
 * so `{ quote: { mine } }` reaches the client as `quoteMine` — and every name
 * below was read off a running server's introspection, not off the read model.
 */
const ATTACHMENT_FIELDS = `id step proposalId fileName contentType sizeBytes`;

export const QUOTE_PROPOSAL_FIELDS = `
  id priceMinor currency startsAt endsAt durationMinutes providerMemberId memberFirstName
  note validUntil createdAt supersededAt supersededCause
  attachments { ${ATTACHMENT_FIELDS} }`;

export const CUSTOMER_QUOTE_FIELDS = `
  id status serviceId serviceName providerId timezone threadId
  expiresAt expiredCause closedReason bookingId requestedAt
  providerName providerSlug providerVerified
  proposal { ${QUOTE_PROPOSAL_FIELDS} }`;

export const CUSTOMER_QUOTE_DETAIL_FIELDS = `
  ${CUSTOMER_QUOTE_FIELDS}
  description neededBy
  address { label line city district directions }
  requestAttachments { ${ATTACHMENT_FIELDS} }
  proposals { ${QUOTE_PROPOSAL_FIELDS} }
  closedNote
  closingAttachments { ${ATTACHMENT_FIELDS} }`;

const PAGE = `
  query QuoteMine($input: QuoteMineInput!) {
    quoteMine(input: $input) {
      items { ${CUSTOMER_QUOTE_FIELDS} }
      counts { open history }
      hasMore
    }
  }`;

const DETAIL = `
  query QuoteById($input: QuoteByIdInput!) {
    quoteById(input: $input) { ${CUSTOMER_QUOTE_DETAIL_FIELDS} }
  }`;

const REQUEST = `
  mutation QuoteRequest($input: QuoteRequestInput!) {
    quoteRequest(input: $input) { quoteId respondBy }
  }`;

const REJECT = `
  mutation QuoteReject($input: QuoteRejectInput!) { quoteReject(input: $input) { quoteId applied } }`;

const WITHDRAW = `
  mutation QuoteWithdraw($input: QuoteWithdrawInput!) { quoteWithdraw(input: $input) { quoteId applied } }`;

const ACCEPT = `
  mutation QuoteAccept($input: QuoteAcceptInput!) { quoteAccept(input: $input) { bookingId payBy } }`;

export interface MyQuotesPageInput { tab: CustomerQuoteTab; offset: number }

export const myQuoteQueries = {
  page: (input: MyQuotesPageInput) =>
    queryOptions({
      queryKey: ["quotes", "mine", input.tab, input.offset] as const,
      queryFn: async (): Promise<CustomerQuotePageDTO> => {
        const d = await sessionGraphql<{ quoteMine: CustomerQuotePageDTO }>(PAGE, {
          input: { tab: input.tab, limit: QUOTES_PAGE_SIZE, offset: input.offset },
        });
        return d.quoteMine;
      },
    }),
  detail: (quoteId: string) =>
    queryOptions({
      queryKey: ["quotes", "mine", "one", quoteId] as const,
      queryFn: async (): Promise<CustomerQuoteDetailDTO | null> => {
        const d = await sessionGraphql<{ quoteById: CustomerQuoteDetailDTO | null }>(DETAIL, {
          input: { quoteId },
        });
        return d.quoteById;
      },
      enabled: quoteId !== "",
    }),
};

export interface RequestQuoteInput {
  serviceId: string;
  description: string;
  locale: string;
  neededBy?: string;
  address?: AddressInput;
  attachments?: { storageKey: string }[];
}

/**
 * Optional fields are spread in only when present rather than sent as `null`.
 * The mutation's zod input marks them `.optional()`, and an explicit `null`
 * for `neededBy` would have to pass the `YYYY-MM-DD` regex to get through.
 */
export async function requestQuote(
  input: RequestQuoteInput,
): Promise<{ quoteId: string; respondBy: string }> {
  const d = await sessionGraphql<{ quoteRequest: { quoteId: string; respondBy: string } }>(REQUEST, {
    input: {
      serviceId: input.serviceId,
      description: input.description,
      locale: input.locale,
      ...(input.neededBy ? { neededBy: input.neededBy } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments }
        : {}),
    },
  });
  return d.quoteRequest;
}

export interface CloseQuoteInput {
  quoteId: string;
  note?: string;
  attachments?: { storageKey: string }[];
}

/**
 * `applied: false` is the compare-and-swap saying it lost — the quote moved on
 * between the read and the write. It is neither an error nor a success, so it
 * travels as data and the caller decides what to say about it.
 */
export async function rejectQuote(
  input: CloseQuoteInput & { reason: QuoteCustomerRejectReason },
): Promise<{ applied: boolean }> {
  const d = await sessionGraphql<{ quoteReject: { quoteId: string; applied: boolean } }>(REJECT, {
    input: {
      quoteId: input.quoteId,
      reason: input.reason,
      ...(input.note ? { note: input.note } : {}),
      ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    },
  });
  return { applied: d.quoteReject.applied };
}

export async function withdrawQuote(input: CloseQuoteInput): Promise<{ applied: boolean }> {
  const d = await sessionGraphql<{ quoteWithdraw: { quoteId: string; applied: boolean } }>(WITHDRAW, {
    input: {
      quoteId: input.quoteId,
      ...(input.note ? { note: input.note } : {}),
      ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    },
  });
  return { applied: d.quoteWithdraw.applied };
}

export async function acceptQuote(input: {
  quoteId: string;
  address?: AddressInput;
}): Promise<{ bookingId: string; payBy: string }> {
  const d = await sessionGraphql<{ quoteAccept: { bookingId: string; payBy: string } }>(ACCEPT, {
    input: { quoteId: input.quoteId, ...(input.address ? { address: input.address } : {}) },
  });
  return d.quoteAccept;
}
```

- [ ] **Step 4: Run the repository test**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes/data
```

Expected: PASS.

- [ ] **Step 5: Write the viewmodel**

Create `apps/frontend/web/src/features/quotes/viewmodel/use-my-quotes.ts`. `ui/` may not reach
`data/`, so this file is also where the DTO types are re-exported for the pages.

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptQuote, myQuoteQueries, rejectQuote, requestQuote, withdrawQuote,
  type CloseQuoteInput, type MyQuotesPageInput, type RequestQuoteInput,
} from "@/features/quotes/data/quote.repository";
import type { QuoteCustomerRejectReason } from "@ntizo/shared";

export type {
  CustomerQuoteDTO, CustomerQuoteDetailDTO, CustomerQuotePageDTO,
  QuoteAttachmentDTO, QuoteProposalDTO, RequestQuoteInput,
} from "@/features/quotes/data/quote.repository";

export function useMyQuotes(input: MyQuotesPageInput) {
  return useQuery(myQuoteQueries.page(input));
}

export function useMyQuote(quoteId: string) {
  return useQuery(myQuoteQueries.detail(quoteId));
}

export function useRequestQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestQuoteInput) => requestQuote(input),
    // A new quote changes the "open" count and the first page of it.
    onSettled: () => void qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

/**
 * Reject and withdraw are one hook because they are one decision with two
 * names: the customer is closing an open quote, and which mutation runs
 * depends only on whether a proposal exists yet. Both invalidate the whole
 * `["quotes"]` prefix — the row, the detail and both tab counts all move.
 */
export function useCloseQuote() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["quotes"] });
  return {
    reject: useMutation({
      mutationFn: (v: CloseQuoteInput & { reason: QuoteCustomerRejectReason }) => rejectQuote(v),
      onSettled: invalidate,
    }),
    withdraw: useMutation({
      mutationFn: (v: CloseQuoteInput) => withdrawQuote(v),
      onSettled: invalidate,
    }),
  };
}

/**
 * Acceptance creates a booking, so it invalidates bookings too — the customer
 * lands on the payment page and their bookings list has just grown a row.
 */
export function useAcceptQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Parameters<typeof acceptQuote>[0]) => acceptQuote(v),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["quotes"] });
      void qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
```

- [ ] **Step 6: Lint and typecheck**

```bash
cd apps/frontend/web && bun run lint && bun run typecheck
```

Expected: clean. A `boundaries/element-types` error here means a layer was crossed; fix the import,
never the config.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/quotes/data apps/frontend/web/src/features/quotes/viewmodel
git commit -m "feat(web): the customer's quote queries and writes, with a lost race carried as data"
```

---

### Task 5: Quote attachments — download, picker, list

Uploading is already solved: `useAttachments` and `uploadAttachment` in `features/messaging` do
exactly what quotes need, and `viewmodel → viewmodel` and `data → data` are both allowed, so this
task reuses them rather than copying them. What is genuinely new is the **download**, which goes to
a different route (`/api/quote/attachments/:id`, not the communication one), and a picker with the
mockup's own labels instead of messaging's paperclip.

**Per-file error copy comes from the `messaging` namespace.** `useAttachments` writes keys of the
form `attachmentError.TOO_LARGE` into `PendingAttachment.errorKey`, and those strings already exist
in eight locales there. Duplicating them under `quotes` would be two sources of truth for one
sentence.

**Files:**
- Create: `apps/frontend/web/src/features/quotes/data/quote-attachment.repository.ts`
- Create: `apps/frontend/web/src/features/quotes/viewmodel/use-quote-attachment-download.ts`
- Create: `apps/frontend/web/src/features/quotes/ui/attachment-picker.tsx`
- Create: `apps/frontend/web/src/features/quotes/ui/attachment-list.tsx`
- Test: `apps/frontend/web/src/features/quotes/ui/__tests__/attachment-picker.test.tsx`

**Interfaces:**
- Consumes: `useAttachments`, `PendingAttachment` from
  `@/features/messaging/viewmodel/use-attachments`; `MAX_ATTACHMENTS`,
  `ACCEPTED_ATTACHMENT_TYPES`, `MAX_ATTACHMENT_BYTES`, `AttachmentDescriptor` from
  `@/features/messaging/domain/types`; `QuoteAttachmentDTO` (Task 4).
- Produces:
  ```ts
  fetchQuoteAttachmentBlob(id: string): Promise<Blob>
  useQuoteAttachmentDownload(): { download(a: QuoteAttachmentDTO): void; failedId: string | null }
  <QuoteAttachmentPicker label files onAdd onRemove disabled? inputId />
  <QuoteAttachmentList attachments />
  ```

- [ ] **Step 1: Write the download repository**

Create `apps/frontend/web/src/features/quotes/data/quote-attachment.repository.ts`:

```ts
import { API_BASE_URL } from "@/shared/lib/env";

/**
 * A quote attachment's bytes.
 *
 * A different route from the messaging one — `/api/quote/attachments/:id`
 * checks quote membership, not thread membership — but the same posture:
 * the session cookie is the only credential, the server answers 403 for both
 * "not yours" and a malformed id, and nothing about who else is on the quote
 * leaks through the difference.
 */
export async function fetchQuoteAttachmentBlob(attachmentId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/quote/attachments/${attachmentId}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.blob();
}
```

Check the import path for `API_BASE_URL` against
`apps/frontend/web/src/features/messaging/data/attachment.repository.ts` and use whatever that file
imports — same module, same name.

- [ ] **Step 2: Write the download viewmodel**

Create `apps/frontend/web/src/features/quotes/viewmodel/use-quote-attachment-download.ts`, modelled
on `@/features/messaging/viewmodel/use-attachment-download.ts`:

```ts
import { useCallback, useState } from "react";
import { fetchQuoteAttachmentBlob } from "@/features/quotes/data/quote-attachment.repository";
import type { QuoteAttachmentDTO } from "@/features/quotes/data/quote.repository";

/**
 * Saving one attachment to the reader's disk.
 *
 * The bytes are fetched rather than linked, because the route needs the
 * session cookie and an `<a href>` to a 403 would open a blank tab instead
 * of saying anything. The object URL is revoked on the next tick — long
 * enough for the click to have been dispatched, short enough that a page
 * full of attachments does not hold every blob it ever showed.
 */
export function useQuoteAttachmentDownload() {
  const [failedId, setFailedId] = useState<string | null>(null);

  const download = useCallback((attachment: QuoteAttachmentDTO) => {
    setFailedId(null);
    void (async () => {
      try {
        const blob = await fetchQuoteAttachmentBlob(attachment.id);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = attachment.fileName;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      } catch {
        setFailedId(attachment.id);
      }
    })();
  }, []);

  return { download, failedId };
}
```

- [ ] **Step 3: Write the failing picker test**

Create `apps/frontend/web/src/features/quotes/ui/__tests__/attachment-picker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/shared/lib/i18n";
import { QuoteAttachmentPicker } from "@/features/quotes/ui/attachment-picker";

beforeEach(async () => { await i18n.changeLanguage("pt-MZ"); });

const file = (name: string) => ({ id: name, file: new File(["x"], name, { type: "image/png" }), errorKey: null });

describe("QuoteAttachmentPicker", () => {
  it("shows the label the caller gave it, not a paperclip", async () => {
    render(<QuoteAttachmentPicker inputId="p" label="Juntar fotos" files={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(await screen.findByText("Juntar fotos")).toBeInTheDocument();
  });

  it("lists what has been picked and offers to remove each one by name", async () => {
    const onRemove = vi.fn();
    render(<QuoteAttachmentPicker inputId="p" label="Juntar fotos"
      files={[file("parede.png")]} onAdd={vi.fn()} onRemove={onRemove} />);
    expect(await screen.findByText("parede.png")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remover parede.png" }));
    expect(onRemove).toHaveBeenCalledWith("parede.png");
  });

  it("says so and stops accepting once five files are picked", async () => {
    const files = ["a", "b", "c", "d", "e"].map(file);
    render(<QuoteAttachmentPicker inputId="p" label="Juntar fotos" files={files} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(await screen.findByText("No máximo 5 ficheiros.")).toBeInTheDocument();
    expect(screen.getByLabelText("Juntar fotos")).toBeDisabled();
  });

  it("shows a rejected file's own reason, in the messaging namespace's words", async () => {
    render(<QuoteAttachmentPicker inputId="p" label="Juntar fotos"
      files={[{ ...file("grande.png"), errorKey: "attachmentError.TOO_LARGE" }]}
      onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes/ui/__tests__/attachment-picker.test.tsx
```

Expected: FAIL — cannot resolve `@/features/quotes/ui/attachment-picker`.

- [ ] **Step 5: Write the picker**

Create `apps/frontend/web/src/features/quotes/ui/attachment-picker.tsx`:

```tsx
import { Paperclip, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants, cn } from "@ntizo/frontend-ui";
import {
  ACCEPTED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS,
} from "@/features/messaging/domain/types";
import type { PendingAttachment } from "@/features/messaging/viewmodel/use-attachments";

const ACCEPT_ATTR = ACCEPTED_ATTACHMENT_TYPES.join(",");
const MAX_ATTACHMENT_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);
const ACCEPTED_FORMATS_LABEL = ACCEPTED_ATTACHMENT_TYPES
  .map((type) => type.split("/")[1]!.toUpperCase())
  .join(", ");

/**
 * The quote flow's file picker: the messaging one's construction with the
 * mockup's words.
 *
 * Same `<label htmlFor>` around a visually hidden `<input type="file">`, same
 * reset-before-dispatch so re-picking one file fires, same second-line check
 * on the cap. What differs is the face: the request page says "Juntar fotos"
 * and the proposal form says "Juntar ficheiro", both as a visible button
 * rather than a paperclip, so `label` and `inputId` are the caller's.
 *
 * Per-file failures render `pending.errorKey` from the **messaging**
 * namespace, because `useAttachments` writes those keys and those sentences
 * already exist in eight languages. One source of truth for "this file is too
 * big", not two that drift.
 */
export function QuoteAttachmentPicker({
  inputId, label, hint, files, onAdd, onRemove, disabled = false,
}: {
  inputId: string;
  label: string;
  hint?: string;
  files: readonly PendingAttachment[];
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("quotes");
  const { t: tm } = useTranslation("messaging");
  const atLimit = files.length >= MAX_ATTACHMENTS;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer",
            (disabled || atLimit) && "pointer-events-none opacity-50",
          )}
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {label}
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          accept={ACCEPT_ATTR}
          aria-label={label}
          disabled={disabled || atLimit}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            // Reset first: picking the exact same file twice in a row fires no
            // change event otherwise, which reads as the second attempt being
            // silently ignored.
            event.target.value = "";
            picked.forEach(onAdd);
          }}
        />
        {hint && !atLimit && (
          <p className="type-caption text-[var(--color-muted-foreground)]">{hint}</p>
        )}
        {atLimit && (
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("attachment.tooMany", { max: MAX_ATTACHMENTS })}
          </p>
        )}
      </div>

      {files.length > 0 && (
        <ul className="grid list-none gap-1.5 p-0">
          {files.map((pending) => (
            <li
              key={pending.id}
              className="type-caption flex flex-wrap items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-border)] px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate">{pending.file.name}</span>
              <button
                type="button"
                onClick={() => onRemove(pending.id)}
                aria-label={t("attachment.remove", { name: pending.file.name })}
                className="shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {pending.errorKey && (
                <p role="alert" className="type-caption w-full text-[var(--color-destructive)]">
                  {tm(pending.errorKey, { maxMB: MAX_ATTACHMENT_MB, formats: ACCEPTED_FORMATS_LABEL })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write the list**

Create `apps/frontend/web/src/features/quotes/ui/attachment-list.tsx`:

```tsx
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { QuoteAttachmentDTO } from "@/features/quotes/viewmodel/use-my-quotes";
import { useQuoteAttachmentDownload } from "@/features/quotes/viewmodel/use-quote-attachment-download";

/** Bytes as a person would say them. Kept local: nothing else in the app needs it yet. */
function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What one side attached, at one step. Each row saves the file; nothing opens in a tab. */
export function QuoteAttachmentList({ attachments }: { attachments: readonly QuoteAttachmentDTO[] }) {
  const { t } = useTranslation("quotes");
  const { download, failedId } = useQuoteAttachmentDownload();

  if (attachments.length === 0) return null;

  return (
    <ul className="grid list-none gap-1.5 p-0">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <button
            type="button"
            onClick={() => download(attachment)}
            aria-label={t("attachment.download", { name: attachment.fileName })}
            className="type-caption flex w-full items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-border)] px-2.5 py-1.5 text-left hover:border-[var(--color-primary)]"
          >
            <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
            <span className="shrink-0 text-[var(--color-muted-foreground)] tabular-nums">
              {sizeLabel(attachment.sizeBytes)}
            </span>
          </button>
          {failedId === attachment.id && (
            <p role="alert" className="type-caption mt-1 text-[var(--color-destructive)]">
              {t("attachment.downloadFailed")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 7: Run the suite, lint and typecheck**

```bash
cd apps/frontend/web
bunx vitest run src/features/quotes
bun run lint && bun run typecheck
```

Expected: PASS and clean.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/src/features/quotes
git commit -m "feat(web): quote attachments — the picker wears the mockup's words and the download knows its own route"
```

---

### Task 6: The entry points — the button finally goes somewhere

Two shipped screens change. The browse row's "Pedir orçamento" stops linking to the service page,
and the service page's quote panel gains the primary action with "Enviar mensagem" demoted to text,
exactly as plate 1 of the mockup draws it.

**Files:**
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-row.tsx:151-181`
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-quote-notice.tsx`
- Modify: whichever file renders `ServiceQuoteNotice` (the service detail panel) to pass the new
  props — find it with `grep -rn "ServiceQuoteNotice" apps/frontend/web/src`
- Test: `apps/frontend/web/src/features/directory/services/ui/__tests__/service-quote-notice.test.tsx`
  (create if absent)

**Interfaces:**
- Consumes: the `quotes:entry.*` keys (Task 1); `quoteForm` on the service detail (Task 2).
- Produces: links to `/quote/$serviceId`, which Task 7 creates. **Until Task 7 lands these links
  point at a route that does not exist — that is expected, and the router's own type generation
  will fail.** Do Task 7 immediately after this one, or run them as one commit if the typed-route
  error blocks the build; if `bun run typecheck` fails only with "no route /quote/$serviceId",
  note it in the report and proceed.

- [ ] **Step 1: Point the browse row at the request page**

In `service-row.tsx`, the `cell.kind === "quote"` branch. Replace the link target and keep
everything else, and add the provider's promise under the price, which the read model already
carries when the service is in quote mode:

```tsx
if (cell.kind === "quote") {
  return {
    price: <p className="type-h3 text-[var(--color-muted-foreground)]">{t("quotePrice")}</p>,
    cta: (
      <Link
        to="/quote/$serviceId"
        params={{ serviceId }}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {t("quoteAction")}
      </Link>
    ),
  };
}
```

Leave `t("quotePrice")` and `t("quoteAction")` on the `directory` namespace where they already are —
this task moves a link, it does not move copy.

- [ ] **Step 2: Write the failing test for the panel**

Create `apps/frontend/web/src/features/directory/services/ui/__tests__/service-quote-notice.test.tsx`.
Follow the router harness in `src/features/bookings/ui/__tests__/bookings-page.test.tsx`: a
`createRootRoute`, a child route at `/quote/$serviceId` rendering a stub, `await router.load()`
before `render`.

```tsx
it("offers the request as the panel's one button", async () => {
  await renderNotice({ providerName: "Frio & Clima Maputo", quoteForm: { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: true, intro: null } });
  const action = await screen.findByRole("link", { name: "Pedir orçamento" });
  expect(action).toHaveAttribute("href", "/quote/s1");
});

it("keeps the message option, as text under the button", async () => {
  await renderNotice({ providerName: "Frio & Clima Maputo", quoteForm: null });
  expect(await screen.findByRole("button", { name: "Enviar mensagem" })).toBeInTheDocument();
});

it("says how fast the provider promised to answer, when they promised", async () => {
  await renderNotice({ providerName: "Frio & Clima Maputo", quoteForm: { responseHours: 48, askDeadline: false, askPhotos: false, askLocation: false, intro: null } });
  expect(await screen.findByText("responde em 48 h")).toBeInTheDocument();
});

it("says nothing about speed when the service has no quote form", async () => {
  await renderNotice({ providerName: "Frio & Clima Maputo", quoteForm: null });
  expect(screen.queryByText(/responde em/)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/directory/services/ui/__tests__/service-quote-notice.test.tsx
```

Expected: FAIL — the link does not exist yet.

- [ ] **Step 4: Rewrite the panel**

`service-quote-notice.tsx` becomes:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@ntizo/frontend-ui";
import { MessageProviderButton } from "@/features/directory/ui/provider-rail";

/**
 * What a service priced by quote shows where a price panel would be.
 *
 * The panel used to be a dead end — one sentence and a way to start a
 * conversation — because there was nothing to send a request to. Now there is:
 * "Pedir orçamento" is the page's one filled button, and messaging keeps its
 * place underneath as text, because some people want to ask a question before
 * describing a whole job.
 *
 * `responseHours` is the provider's own promise, from the quote form they
 * configured. Shown before the customer commits to typing, because a promise
 * nobody sees is not one.
 */
export function ServiceQuoteNotice({
  serviceId,
  providerId,
  providerName,
  quoteForm,
}: {
  serviceId: string;
  providerId: string;
  providerName: string;
  quoteForm: { responseHours: number } | null;
}) {
  const { t } = useTranslation("quotes");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="type-h3">{t("entry.panelTitle")}</p>
        {quoteForm && (
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("entry.respondsIn", { hours: quoteForm.responseHours })}
          </p>
        )}
      </div>

      <p className="type-body text-[var(--color-muted-foreground)]">
        {t("entry.panelBody", { provider: providerName })}
      </p>

      <Link
        to="/quote/$serviceId"
        params={{ serviceId }}
        className={buttonVariants({ className: "w-full" })}
      >
        {t("entry.action")}
      </Link>

      {/* `compact` is this component's own text-link treatment, which is what
          the mockup asks for here: messaging stops being a button the moment
          the page has a real primary action. */}
      <MessageProviderButton providerId={providerId} compact />
    </div>
  );
}
```

`MessageProviderButton` lives in `@/features/directory/ui/provider-rail` and takes
`{ providerId, variant?: "default" | "outline", compact?: boolean, label?: string }`. Use `compact`;
do not add a variant to a shared component from here.

- [ ] **Step 5: Pass the new props at the call site**

The panel now needs `serviceId`, `providerName` and `quoteForm`. All three are already on the
service detail the caller holds (`quoteForm` since Task 2). Update the one call site.

- [ ] **Step 6: Run the directory suites**

```bash
cd apps/frontend/web && bunx vitest run src/features/directory
```

Expected: PASS. A `service-row` snapshot or href assertion that still expects `/services/$id` is a
test that encoded the dead end — update it to `/quote/$serviceId` and say so in the commit.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/ui
git commit -m "feat(web): «Pedir orçamento» stops linking to the page you are already on"
```

---

### Task 7: `/quote/$serviceId` — the request

Plate 2 of the mockup. One page: the provider's intro, the description, and whichever of deadline,
photos and address the provider asked for; a rail saying who answers, by when, and what happens
next.

**Files:**
- Create: `apps/frontend/web/src/features/quotes/ui/request-page.tsx`
- Create: `apps/frontend/web/src/routes/_customer/quote.$serviceId.tsx`
- Test: `apps/frontend/web/src/features/quotes/ui/__tests__/request-page.test.tsx`

**Interfaces:**
- Consumes: `useServiceDetail` and `prefetchServiceDetail` from
  `@/features/directory/services/viewmodel/use-service-detail` and
  `.../data/service-detail.repository`; `useRequestQuote` (Task 4); `useAttachments` (messaging);
  `QuoteAttachmentPicker` (Task 5); `useMyAddresses`, `useAddressMutations` from
  `@/features/account/viewmodel/use-addresses`; `AddressForm`; `toAddressInput` (Task 2);
  `hasContact` from `@ntizo/shared/text`.
- Produces: `<RequestQuotePage serviceId />`; on success `navigate({ to: "/quotes/$quoteId" })`.

- [ ] **Step 1: Write the route**

Create `apps/frontend/web/src/routes/_customer/quote.$serviceId.tsx`. Under `_customer`, so the
sign-in guard and the site chrome are inherited — this is a normal customer page, not a checkout
step, and the mockup draws the ordinary header on it. `_customer` is a pathless layout, so the URL
is `/quote/$serviceId`.

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { prefetchServiceDetail } from "@/features/directory/services/data/service-detail.repository";
import { RequestQuotePage } from "@/features/quotes/ui/request-page";

/**
 * The request lives under `_customer` rather than beside `/book/$serviceId`,
 * because unlike checkout's first step it is signed-in only: there is nobody
 * to attribute an anonymous request to. The layout's own `beforeLoad` already
 * bounces a visitor to `/sign-in?next=…` and brings them back here.
 *
 * The loader warms the service detail so `useServiceDetail`'s suspense query
 * has an answer before the component mounts, exactly as `book.$serviceId`
 * does it.
 */
export const Route = createFileRoute("/_customer/quote/$serviceId")({
  loader: ({ context, params }) => prefetchServiceDetail(context.queryClient, params.serviceId),
  component: RequestQuote,
});

function RequestQuote() {
  const { serviceId } = Route.useParams();
  return <RequestQuotePage key={serviceId} serviceId={serviceId} />;
}
```

Confirm the generated route id against `src/routes/_customer/bookings.index.tsx`'s own string before
committing; TanStack's generator is the authority on whether it is `/_customer/quote/$serviceId`.

- [ ] **Step 2: Write the failing page test**

Create `apps/frontend/web/src/features/quotes/ui/__tests__/request-page.test.tsx`, using the router
harness from `bookings-page.test.tsx` (root route, a `/quote/$serviceId` child, a `/quotes/$quoteId`
stub to navigate to, `await router.load()` before `render`, `i18n.changeLanguage("pt-MZ")` in
`beforeEach`). Mock `sessionGraphql` with `vi.hoisted` and dispatch on the operation name in the
document string.

```tsx
it("shows the provider's intro in the provider's own voice, when there is one", async () => {
  await renderRequest({ quoteForm: { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: true, intro: "Diga-nos quantos aparelhos." } });
  expect(await screen.findByText("Diga-nos quantos aparelhos.")).toBeInTheDocument();
  expect(screen.getByText("Frio & Clima Maputo:")).toBeInTheDocument();
});

it("hides the deadline, the photos and the address the provider did not ask for", async () => {
  await renderRequest({ quoteForm: { responseHours: 24, askDeadline: false, askPhotos: false, askLocation: false, intro: null } });
  expect(screen.queryByLabelText(/Até quando precisa/)).not.toBeInTheDocument();
  expect(screen.queryByText("Fotos")).not.toBeInTheDocument();
  expect(screen.queryByText("Onde é o trabalho")).not.toBeInTheDocument();
});

it("asks for the address anyway when the job happens at the customer's, whatever the form says", async () => {
  await renderRequest({ locationType: "at_customer", quoteForm: { responseHours: 24, askDeadline: false, askPhotos: false, askLocation: false, intro: null } });
  expect(await screen.findByText("Onde é o trabalho")).toBeInTheDocument();
});

it("refuses an empty description before it sends anything", async () => {
  await renderRequest();
  await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  expect(await screen.findByText("Escreva o que precisa antes de enviar.")).toBeInTheDocument();
  expect(fakes.graphql).not.toHaveBeenCalledWith(expect.stringContaining("QuoteRequest"), expect.anything());
});

it("refuses a description carrying a phone number, and says why", async () => {
  await renderRequest();
  await userEvent.type(screen.getByLabelText("O que precisa"), "Liguem para 84 123 4567");
  await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Tire o número de telefone/);
});

it("sends the request and lands on the quote it created", async () => {
  const { router } = await renderRequest();
  await userEvent.type(screen.getByLabelText("O que precisa"), "Dois aparelhos split de 12 000 BTU");
  await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/quotes/q1"));
});

it("says so when the customer already has an open quote for this service", async () => {
  // sessionGraphql rejects with a GraphqlError whose code is QUOTE_ALREADY_OPEN
  await renderRequest({ requestError: "QUOTE_ALREADY_OPEN" });
  await userEvent.type(screen.getByLabelText("O que precisa"), "Outra vez");
  await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  expect(await screen.findByRole("alert"))
    .toHaveTextContent("Já tem um orçamento em aberto para este serviço.");
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes/ui/__tests__/request-page.test.tsx
```

Expected: FAIL — cannot resolve `@/features/quotes/ui/request-page`.

- [ ] **Step 4: Write the page**

Create `apps/frontend/web/src/features/quotes/ui/request-page.tsx`. The shape, with the parts that
carry real decisions written out:

```tsx
const REQUEST_ERROR_COPY: Record<string, string> = {
  CONTACT_DETECTED: "request.errorContact",
  QUOTE_ALREADY_OPEN: "request.errorAlreadyOpen",
  QUOTE_SERVICE_NOT_QUOTABLE: "request.errorNotQuotable",
};

export function RequestQuotePage({ serviceId }: { serviceId: string }) {
  const { t, i18n } = useTranslation("quotes");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const service = useServiceDetail(serviceId);
  const request = useRequestQuote();
  const attachments = useAttachments();

  const [description, setDescription] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [addressId, setAddressId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // The provider asks for the address when they need it to price the job; the
  // job happening at the customer's home forces the question regardless,
  // because a booking past DRAFT must carry one and asking here beats
  // ambushing them on the acceptance page.
  const form = service?.quoteForm ?? null;
  const wantsAddress = (form?.askLocation ?? false) || service?.locationType === "at_customer";
  const addresses = useMyAddresses({ enabled: wantsAddress });

  // …loading and not-found ladders, exactly the shape booking-page.tsx uses…

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setRefusal(null);

    const text = description.trim();
    if (text === "") return setRefusal("request.errorDescriptionRequired");
    // The same detector the backend runs, run here so the refusal arrives in
    // the moment rather than after a round trip.
    if (hasContact(text)) return setRefusal("request.errorContact");

    const chosen = addresses.data?.find((a) => a.id === addressId) ?? null;
    if (wantsAddress && chosen === null) return setRefusal("request.errorAddressRequired");

    // Uploads run once, at submit, and resolve to null on the first failure —
    // never a partial list. The picker shows which file and why.
    const uploaded = await attachments.uploadAll();
    if (uploaded === null) return;

    try {
      const { quoteId } = await request.mutateAsync({
        serviceId,
        description: text,
        locale,
        ...(neededBy !== "" ? { neededBy } : {}),
        ...(chosen ? { address: toAddressInput(chosen) } : {}),
        ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
      });
      await navigate({ to: "/quotes/$quoteId", params: { quoteId } });
    } catch (error) {
      const code = error instanceof GraphqlError ? error.code : undefined;
      setRefusal(REQUEST_ERROR_COPY[code ?? ""] ?? "request.errorGeneric");
    }
  }
  // …
}
```

Layout, from the mockup: a `lg:grid-cols-[minmax(0,1fr)_20rem]` with the form first
(`order-2 lg:order-1`) and the rail second, so a phone reads the form before the reassurance.

The form's parts, in order:

1. **Title** `t("request.title")` as `type-h1`, with the service name above it as a caption.
2. **Lead** `t("request.lead", { provider: service.providerName })`.
3. **The provider's intro**, only when `form?.intro` is set: a quiet tinted block, the provider's
   name with a colon as its label. The one thing on the page in the provider's voice.
4. **Description** — a `<textarea id="quote-description">` with a real `<label htmlFor>`, and
   `t("request.descriptionHint")` under it in `type-caption`.
5. **Deadline**, only when `form?.askDeadline` — a `<input type="date">` with
   `t("request.optional")` beside the label. Its value is already `YYYY-MM-DD`, which is what the
   mutation wants; do not reformat it.
6. **Photos**, only when `form?.askPhotos` — `<QuoteAttachmentPicker inputId="quote-photos"
   label={t("request.photosAction")} hint={t("request.photosHint")}
   files={attachments.files} onAdd={attachments.add} onRemove={attachments.remove} />`.
   **`useAttachments` returns `{ files, add, remove, reset, uploading, uploadAll }`, not
   `onAdd`/`onRemove`** — spreading it wholesale silently passes no handlers`.
7. **Address**, only when `wantsAddress` — the `<fieldset>` + radio construction from
   `details-page.tsx:641-695`, verbatim in structure with `name="quote-address"`, including its
   three states (loading skeleton, `role="alert"` with a retry button, the list) and `AddressForm`
   inline when the customer has none. `t("request.addressNote")` underneath.
8. **Actions** — `Enviar pedido` as the one filled button, `Cancelar` as an outline button that
   navigates back to `/services/$id`.
9. **The refusal**, rendered once above the actions as
   `{refusal && <p role="alert" className="type-caption text-[var(--color-destructive)]">{t(refusal)}</p>}`.

The rail:

- **Quem responde** — the provider's logo (`BrandImage`), name, and
  `t("request.ratingAndJobs", { rating, jobs })` plus `t("request.verified")` when
  `service.providerVerified`. All three come from the service detail this page already loaded.
- `t("request.railPromise", { hours: form.responseHours })`, only when there is a form.
- **O que acontece a seguir** — an `<ol>` of the three numbered steps. Numbered because it is a real
  sequence: a proposal, then a decision, then a payment.
- `t("request.railFooter")` in `type-caption`.

- [ ] **Step 5: Run the suite**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes
```

Expected: PASS.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
cd apps/frontend/web && bun run lint && bun run typecheck
cd ../../.. && git add apps/frontend/web/src/features/quotes apps/frontend/web/src/routes
git commit -m "feat(web): the request page asks only what the provider needs to price the job"
```

---

### Task 8: `/quotes` — the customer's list, and the way into it

Plate 3. Two tabs, rows that read left to right as the question the customer has, and the nav entry
that makes the page reachable.

**Files:**
- Create: `apps/frontend/web/src/features/quotes/ui/quotes-page.tsx`
- Create: `apps/frontend/web/src/features/quotes/ui/quote-status.tsx`
- Create: `apps/frontend/web/src/routes/_customer/quotes.index.tsx`
- Modify: `apps/frontend/web/src/shared/components/user-menu.tsx` and its test
- Test: `apps/frontend/web/src/features/quotes/ui/__tests__/quotes-page.test.tsx`

**Interfaces:**
- Consumes: `useMyQuotes` (Task 4); `customerTone`, `clockOf`, `coarseDuration`, `TONE_CLASS`,
  `QUOTES_PAGE_SIZE` (Task 3); `CollectionCard` from `@/shared/components/collection-card`;
  `formatMoney`; `compactSlotWording`, `momentWording`.
- Produces: `<QuotesPage />`; `<QuoteStatusLine quote side="customer" | "provider" now />`, reused by
  Tasks 12 and 13.

- [ ] **Step 1: Write the shared status line**

Create `apps/frontend/web/src/features/quotes/ui/quote-status.tsx`. One component, two readers —
the dot's colour and the sentence both come from `side`, which is the whole point of having two tone
functions.

```tsx
/**
 * The status, as a dot and words, plus the clock line that says what the dot
 * means in time.
 *
 * Not a pill: a quote's status is a sentence about whose turn it is, and a
 * pill reads as a category. The two sides get different sentences for the
 * same status because they are asking different questions — the customer at
 * `REQUESTED` is waiting, the provider at `REQUESTED` is owed.
 */
export function QuoteStatusLine({ quote, side, now }: {
  quote: QuoteLike;
  side: "customer" | "provider";
  now: Date;
}) {
  const { t, i18n } = useTranslation("quotes");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const tone = side === "customer" ? customerTone(quote.status) : providerTone(quote.status);
  const clock = clockOf(quote);

  const at = (iso: string) => {
    const { date, time } = momentWording(iso, locale, quote.timezone);
    return `${date}, ${time}`;
  };
  const span = (iso: string) => {
    const left = coarseDuration(new Date(iso).getTime() - now.getTime());
    return left === null ? null : t(`unit.${left.unit}`, { count: left.count });
  };
  // …one switch on clock.kind producing the locale key and its values,
  //    `clock.customer.*` or `clock.provider.*` by `side`…
}
```

Add the three `unit.*` keys to the `quotes` namespace in Task 1's file if they are not there yet —
`"unit": { "min": "{{count}} min", "h": "{{count}} h", "d": "{{count}} dias", "d_one": "{{count}} dia" }` —
and to all eight locales.

- [ ] **Step 2: Write the failing list test**

Create `apps/frontend/web/src/features/quotes/ui/__tests__/quotes-page.test.tsx`. Because jsdom
applies no CSS, `CollectionCard` renders the table **and** the phone cards, so every value is in the
DOM twice — copy the `row(name)` / `card(name)` scoping helpers from `bookings-page.test.tsx` and
have every assertion pick one.

```tsx
it("reads a proposal row as price, when, and whose move it is", async () => {
  await renderQuotes(pageWith(proposedQuote));
  const r = await row("Instalação de ar condicionado");
  expect(within(r).getByText("Proposta recebida")).toBeInTheDocument();
  expect(within(r).getByText(/a sua decisão/)).toBeInTheDocument();
  expect(within(r).getByText("9.800,00 MZN")).toBeInTheDocument();
});

it("says there is no price yet rather than showing a zero", async () => {
  await renderQuotes(pageWith(requestedQuote));
  expect(within(await row("Pintura de apartamento T2")).getByText("sem preço ainda")).toBeInTheDocument();
});

it("points an accepted quote at its booking instead of repeating the price story", async () => {
  await renderQuotes(pageWith(acceptedQuote));
  expect(within(await row("Montagem de cozinha")).getByText("passou a reserva")).toBeInTheDocument();
});

it("says who dropped an expired quote", async () => {
  await renderQuotes(pageWith(expiredQuote));
  expect(within(await row("Jardinagem · limpeza de quintal"))
    .getByText(/o prestador não respondeu/)).toBeInTheDocument();
});

it("counts both tabs on the tabs themselves", async () => {
  await renderQuotes(pageWith(proposedQuote, { counts: { open: 2, history: 4 } }));
  expect(await screen.findByRole("tab", { name: /Em aberto/ })).toHaveTextContent("2");
  expect(screen.getByRole("tab", { name: /Histórico/ })).toHaveTextContent("4");
});

it("moves the tab into the URL, so a reload keeps it", async () => {
  const { router } = await renderQuotes(pageWith(proposedQuote));
  await userEvent.click(screen.getByRole("tab", { name: /Histórico/ }));
  await waitFor(() => expect(router.state.location.search).toEqual({ tab: "history" }));
});

it("asks for the next page only while the server says there is one", async () => {
  await renderQuotes(pageWith(proposedQuote, { hasMore: false }));
  expect(screen.queryByRole("button", { name: "Mais" })).not.toBeInTheDocument();
});

it("invites a customer with nothing yet to go and find a quotable service", async () => {
  await renderQuotes({ items: [], counts: { open: 0, history: 0 }, hasMore: false });
  expect(await screen.findByText("Ainda não pediu orçamentos")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver serviços sob orçamento" }))
    .toHaveAttribute("href", expect.stringContaining("/services"));
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes/ui/__tests__/quotes-page.test.tsx
```

Expected: FAIL — cannot resolve `@/features/quotes/ui/quotes-page`.

- [ ] **Step 4: Write the route**

```tsx
// apps/frontend/web/src/routes/_customer/quotes.index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { CUSTOMER_QUOTE_TABS, type CustomerQuoteTab } from "@ntizo/shared";
import { QuotesPage } from "@/features/quotes/ui/quotes-page";

/**
 * `.index.tsx` beside `.$quoteId.tsx`, never a bare `quotes.tsx`: a bare file
 * matches the sibling route's path but never mounts it.
 *
 * Every key is returned, and a rejected one as `undefined` rather than
 * omitted — the root has no `validateSearch`, so an omitted key leaves the raw
 * URL value in place.
 */
export const Route = createFileRoute("/_customer/quotes/")({
  validateSearch: (search: Record<string, unknown>): { tab?: CustomerQuoteTab } =>
    CUSTOMER_QUOTE_TABS.includes(search["tab"] as CustomerQuoteTab)
      ? { tab: search["tab"] as CustomerQuoteTab }
      : {},
  component: QuotesPage,
});
```

- [ ] **Step 5: Write the page**

`apps/frontend/web/src/features/quotes/ui/quotes-page.tsx`, following `bookings-page.tsx` step for
step. The three things that differ from it:

```tsx
// 1. The pager is `hasMore`, not `nextOffset`. There is no `total` on the
//    wire either, so the card's `total` comes from the tab's own count.
const answered = query.data ?? page;
const total = answered?.counts[tab] ?? 0;
const canLoadMore = answered?.hasMore === true;

// 2. Reset during render, never in an effect — the same idiom bookings uses.
const [appliedTab, setAppliedTab] = useState(tab);
if (appliedTab !== tab) { setAppliedTab(tab); setOffset(0); setLoaded([]); setPage(null); }

// 3. One clock for every row on screen.
const now = useMemo(() => new Date(query.dataUpdatedAt || Date.now()), [query.dataUpdatedAt]);
```

Each row, per the mockup: `primary` is a `<Link to="/quotes/$quoteId" params={{ quoteId: q.id }}>`
carrying the service name with the provider's name under it; `cells.status` is
`<QuoteStatusLine quote={q} side="customer" now={now} />`; `cells.price` is
`formatMoney(q.proposal.priceMinor, q.proposal.currency, locale)` when there is a live proposal,
`t("list.noPriceYet")` at `REQUESTED`, `t("list.noProposal")` when a quote closed without one, and
`t("list.notAccepted")` under the price on a `REJECTED` row. Below `md` the card body stacks title,
then status and clock, then price on its own line — that is what `cardBody` is for.

Empty state: `emptyTitle`, `emptyText` and an `emptyAction` linking to `/services`. The mockup's
"Ver serviços sob orçamento" points at browse; there is no quote-mode filter on the browse page
today, so link to `/services` plain rather than invent a search param that filters nothing.

- [ ] **Step 6: Put "Orçamentos" in the user menu**

In `apps/frontend/web/src/shared/components/user-menu.tsx`, between "As minhas reservas" and
"Mensagens" — the mockup's order, and the order the two sit in on the provider side too:

```tsx
<DropdownMenuItem onSelect={() => navigate({ to: "/quotes" })}>
  <FileText className="h-4 w-4" />
  {t("quotes")}
</DropdownMenuItem>
```

Extend `user-menu.test.tsx` with an assertion that the item exists and navigates to `/quotes`,
mirroring the existing one for bookings.

- [ ] **Step 7: Run the suites**

```bash
cd apps/frontend/web
bunx vitest run src/features/quotes src/shared/components/user-menu.test.tsx
bun run lint && bun run typecheck
```

Expected: PASS and clean.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/src/features/quotes apps/frontend/web/src/routes/_customer/quotes.index.tsx \
  apps/frontend/web/src/shared/components/user-menu.tsx apps/frontend/web/src/shared/components/user-menu.test.tsx
git commit -m "feat(web): «Os meus orçamentos», two tabs and a row that says whose turn it is"
```

---

### Task 9: `/quotes/$quoteId` — the proposal, and the two ways to close it

Plate 4 and plate 7b. The price is the first thing on the page; the request and the superseded
proposals sit below as the story. One blue button, and it says the amount.

**Files:**
- Create: `apps/frontend/web/src/features/quotes/ui/quote-page.tsx`
- Create: `apps/frontend/web/src/features/quotes/ui/close-dialog.tsx`
- Create: `apps/frontend/web/src/routes/_customer/quotes.$quoteId.tsx`
- Test: `apps/frontend/web/src/features/quotes/ui/__tests__/quote-page.test.tsx`
- Test: `apps/frontend/web/src/features/quotes/ui/__tests__/close-dialog.test.tsx`

**Interfaces:**
- Consumes: `useMyQuote`, `useCloseQuote` (Task 4); `canAccept`, `canReject`, `canWithdraw`,
  `revisionCount` (Task 3); `QuoteAttachmentList`, `QuoteAttachmentPicker` (Task 5);
  `QuoteStatusLine` (Task 8); `useAttachments` (messaging); `slotWording`, `momentWording`.
- Produces: `<QuotePage quoteId />`;
  `<CloseQuoteDialog kind="reject" | "withdraw" | "decline" reasons onConfirm onClose busy />`,
  reused by Task 13 for the provider's "Recusar pedido".

- [ ] **Step 1: Write the failing dialog test**

Create `apps/frontend/web/src/features/quotes/ui/__tests__/close-dialog.test.tsx`.

```tsx
it("offers the reasons it was given and nothing else", async () => {
  render(<CloseQuoteDialog kind="reject" reasons={QUOTE_CUSTOMER_REJECT_REASONS}
    otherName="Frio & Clima Maputo" onConfirm={vi.fn()} onClose={vi.fn()} busy={false} />);
  expect(await screen.findByRole("radio", { name: "Está acima do meu orçamento" })).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "Fora da minha zona" })).not.toBeInTheDocument();
});

it("hands back the reason, the note and the files together", async () => {
  const onConfirm = vi.fn();
  render(<CloseQuoteDialog kind="reject" reasons={QUOTE_CUSTOMER_REJECT_REASONS}
    otherName="Frio & Clima" onConfirm={onConfirm} onClose={vi.fn()} busy={false} />);
  await userEvent.click(await screen.findByRole("radio", { name: "A data não me serve" }));
  await userEvent.type(screen.getByLabelText(/Nota/), "Estou fora nesse fim-de-semana.");
  await userEvent.click(screen.getByRole("button", { name: "Recusar proposta" }));
  expect(onConfirm).toHaveBeenCalledWith({
    reason: "wrong_time", note: "Estou fora nesse fim-de-semana.", files: [],
  });
});

it("has no reason list at all when it is a withdrawal, because there is no token for one", async () => {
  render(<CloseQuoteDialog kind="withdraw" reasons={null} otherName="Frio & Clima"
    onConfirm={vi.fn()} onClose={vi.fn()} busy={false} />);
  expect(await screen.findByRole("button", { name: "Retirar pedido" })).toBeInTheDocument();
  expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
});

it("refuses a note carrying a contact before it sends anything", async () => {
  const onConfirm = vi.fn();
  render(<CloseQuoteDialog kind="withdraw" reasons={null} otherName="Frio & Clima"
    onConfirm={onConfirm} onClose={vi.fn()} busy={false} />);
  await userEvent.type(await screen.findByLabelText(/Nota/), "Ligue 84 123 4567");
  await userEvent.click(screen.getByRole("button", { name: "Retirar pedido" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Tire o número de telefone/);
  expect(onConfirm).not.toHaveBeenCalled();
});

it("stays open and says nothing changed when the write reports a lost race", async () => {
  render(<CloseQuoteDialog kind="reject" reasons={QUOTE_CUSTOMER_REJECT_REASONS}
    otherName="Frio & Clima" onConfirm={vi.fn()} onClose={vi.fn()} busy={false}
    notice="close.errorMoved" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Isto mudou entretanto. Voltámos a carregar.");
});
```

- [ ] **Step 2: Run it and watch it fail, then write the dialog**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes/ui/__tests__/close-dialog.test.tsx
```

Then create `apps/frontend/web/src/features/quotes/ui/close-dialog.tsx`, on
`cancel-dialog.tsx`'s bones: `Dialog / DialogContent / DialogHeader / DialogTitle /
DialogDescription / DialogFooter` from `@ntizo/frontend-ui`, `<Dialog open onOpenChange={(next) =>
{ if (!next) onClose(); }}>` with a literal `open` because the caller controls existence by
mounting.

```tsx
/**
 * One dialog for all three refusals: the customer's "Recusar", the customer's
 * "Retirar o pedido" and the provider's "Recusar pedido".
 *
 * They differ in three words and one list of reasons, which is why `kind` and
 * `reasons` are props rather than three components. A withdrawal has no reason
 * token — the customer changed their mind and there is nothing for the other
 * side to read into it — so `reasons: null` removes the fieldset entirely
 * rather than showing an empty one.
 *
 * The dialog does not own the mutation. It hands back what the person chose
 * and the page decides which write that is; `busy` and `notice` come back down
 * so a lost race can be shown here rather than behind a closed dialog.
 */
export function CloseQuoteDialog({ kind, reasons, otherName, onConfirm, onClose, busy, notice }: {
  kind: "reject" | "withdraw" | "decline";
  reasons: readonly string[] | null;
  otherName: string;
  onConfirm: (v: { reason: string | null; note: string; files: File[] }) => void;
  onClose: () => void;
  busy: boolean;
  notice?: string;
}) { /* … */ }
```

The reason list is a `<fieldset>` with `<legend>{t("close.reasonLegend")}</legend>` and one
`<label>` + `<input type="radio" name="quote-close-reason">` per token, labelled
`t(\`close.reason.${token}\`)`. The first token is selected by default, as `decline-dialog.tsx`
does. The note is a `<textarea>` with `t("close.optional")` beside its label and the contact check
before `onConfirm`. Files go through `<QuoteAttachmentPicker inputId="quote-close-files"
label={t("close.fileAction")} …>`. The footer is `Manter` (outline) and the confirm button
(`variant="destructive"`), both `disabled={busy}`.

- [ ] **Step 3: Write the failing page test**

Create `apps/frontend/web/src/features/quotes/ui/__tests__/quote-page.test.tsx`.

```tsx
it("puts the price first, at the size the mockup gives it", async () => {
  await renderQuote(proposedDetail);
  const price = await screen.findByText("9 800");
  expect(price).toBeInTheDocument();
  expect(screen.getByText("MZN")).toBeInTheDocument();
});

it("says the amount on the button, because it is the thing being agreed", async () => {
  await renderQuote(proposedDetail);
  expect(await screen.findByRole("link", { name: "Aceitar e pagar 9.800,00 MZN" }))
    .toHaveAttribute("href", "/quotes/q1/accept");
});

it("keeps a superseded proposal as history, with the provider's own words for why", async () => {
  await renderQuote(revisedDetail);
  expect(await screen.findByText(/Proposta anterior/)).toBeInTheDocument();
  expect(screen.getByText("Revi o tubo, afinal chega com menos.")).toBeInTheDocument();
});

it("offers withdrawal only before a proposal exists, and never as an invitation", async () => {
  await renderQuote(requestedDetail);
  expect(await screen.findByRole("button", { name: "Retirar o pedido" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Recusar" })).not.toBeInTheDocument();
});

it("offers refusal only while a proposal is live", async () => {
  await renderQuote(proposedDetail);
  expect(await screen.findByRole("button", { name: "Recusar" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retirar o pedido" })).not.toBeInTheDocument();
});

it("points an accepted quote at its booking", async () => {
  await renderQuote(acceptedDetail);
  expect(await screen.findByRole("link", { name: "Ver a reserva" }))
    .toHaveAttribute("href", "/bookings/b1");
});

it("says it reloaded rather than claiming success when a refusal loses the race", async () => {
  await renderQuote(proposedDetail, { rejectApplied: false });
  await userEvent.click(await screen.findByRole("button", { name: "Recusar" }));
  await userEvent.click(await screen.findByRole("radio", { name: "A data não me serve" }));
  await userEvent.click(screen.getByRole("button", { name: "Recusar proposta" }));
  expect(await screen.findByRole("alert"))
    .toHaveTextContent("Isto mudou entretanto. Voltámos a carregar.");
});

it("says a quote it cannot find is gone, rather than showing an empty page", async () => {
  await renderQuote(null);
  expect(await screen.findByText("Este orçamento não existe")).toBeInTheDocument();
});
```

- [ ] **Step 4: Run it, watch it fail, write the page and the route**

Route, three lines plus the guard it inherits:

```tsx
// apps/frontend/web/src/routes/_customer/quotes.$quoteId.tsx
export const Route = createFileRoute("/_customer/quotes/$quoteId")({ component: Quote });
function Quote() {
  const { quoteId } = Route.useParams();
  return <QuotePage key={quoteId} quoteId={quoteId} />;
}
```

`key={quoteId}` resets the dialog state when the router moves between two quotes without unmounting.

The page, `apps/frontend/web/src/features/quotes/ui/quote-page.tsx`. All hooks above the ladder;
the ladder itself is `booking-page.tsx`'s, verbatim in shape:

```tsx
if (query.isLoading) return <>{back}<Skeleton className="h-10 w-1/2" /><Skeleton className="h-48 w-full" /></>;
if (query.isError)   return <>{back}<p role="alert" className="type-body text-[var(--color-destructive)]">{t("detail.loadError")}</p></>;
if (!q)              return <>{back}<EmptyCard framed title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} /></>;
```

Body, in the mockup's order, inside `lg:grid-cols-[minmax(0,1fr)_20rem]` with
`order-2 lg:order-1` on the main column:

1. **Header** — service name as `type-h1`, `providerName · <QuoteStatusLine side="customer" />`
   under it.
2. **The proposal, when there is one** — the price as `type-display` in
   `text-[var(--color-primary)]` with the currency beside it at caption size; then
   `slotWording(startsAt, endsAt, locale, q.timezone)` as one line; then
   `t("detail.durationHours", { count })` and
   `t("detail.memberDoes", { name: proposal.memberFirstName })`; then the note; then
   `<QuoteAttachmentList attachments={proposal.attachments} />`; then
   `t("detail.validUntil", { when })`.
3. **Actions** — `Aceitar e pagar {amount}` as a `<Link to="/quotes/$quoteId/accept">` styled with
   `buttonVariants()`, `Recusar` as a text button opening the dialog, `Conversar` as a `<Link>` to
   the thread when `q.threadId` is set. On `ACCEPTED`, one `<Link to="/bookings/$bookingId">`
   instead. On `REQUESTED`, none of these — the page says
   `t("detail.waitingBody", { provider, when })` and the rail carries the withdrawal.
4. **O seu pedido** — the description, `neededBy`, the address, and the request's attachments.
5. **Antes desta proposta** — every entry of `q.proposals` with `supersededAt !== null`, newest
   first: the struck-through price, when it was replaced, and the provider's note. Then the request
   itself as the last entry, with `t("detail.respondByWas")`.

Rail: **Quem propõe** (name, `t("request.verified")` when `providerVerified`, a link to
`/providers/$slug`); **Como vai isto** as an `<ol>` with a filled dot for what has happened and a
hollow one for what has not, `t("detail.stepProposedRevised", { count: revisionCount(q.proposals) })`
under the proposal step when there were revisions; `t("detail.railFooter")`; and
`t("detail.withdraw")` as small text at the very bottom when `canWithdraw(q)` — it exists, it is not
an invitation.

Both refusals go through one handler:

```tsx
const close = useCloseQuote();
const [dialog, setDialog] = useState<"reject" | "withdraw" | null>(null);
const [notice, setNotice] = useState<string | undefined>(undefined);

async function confirmClose(v: { reason: string | null; note: string; files: File[] }) {
  setNotice(undefined);
  const uploaded = await attachments.uploadAll();
  if (uploaded === null) return;
  const payload = {
    quoteId, ...(v.note ? { note: v.note } : {}),
    ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
  };
  try {
    const result = dialog === "reject"
      ? await close.reject.mutateAsync({ ...payload, reason: v.reason as QuoteCustomerRejectReason })
      : await close.withdraw.mutateAsync(payload);
    // `applied: false` is the compare-and-swap saying it lost. The refetch has
    // already been queued by the hook's `onSettled`; all that is left is to
    // not claim it worked.
    if (!result.applied) return setNotice("close.errorMoved");
    setDialog(null);
  } catch (error) {
    const code = error instanceof GraphqlError ? error.code : undefined;
    setNotice(code === "CONTACT_DETECTED" ? "close.errorContact"
            : code === "QUOTE_TRANSITION" ? "close.errorMoved" : "close.errorGeneric");
  }
}
```

- [ ] **Step 5: Run, lint, typecheck, commit**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes && bun run lint && bun run typecheck
cd ../../.. && git add apps/frontend/web/src/features/quotes apps/frontend/web/src/routes/_customer/quotes.\$quoteId.tsx
git commit -m "feat(web): the proposal page leads with the price and keeps the one it replaced"
```

---

### Task 10: `/quotes/$quoteId/accept` — accepting is paying

Plate 5. Mirrors checkout's third page: what is being agreed, where the M-Pesa prompt goes, one
button. The phone is saved before the acceptance, in that order, because a booking that reaches
`PENDING_PAYMENT` without a number cannot be charged.

**Files:**
- Create: `apps/frontend/web/src/features/quotes/ui/accept-page.tsx`
- Create: `apps/frontend/web/src/routes/_customer/quotes.$quoteId.accept.tsx`
- Test: `apps/frontend/web/src/features/quotes/ui/__tests__/accept-page.test.tsx`

**Interfaces:**
- Consumes: `useMyQuote`, `useAcceptQuote` (Task 4); `useCurrentUser` from
  `@/features/user/viewmodel/use-current-user`; `useUpdateMyProfile` from
  `@/features/account/viewmodel/use-update-profile`; `useMyAddresses`, `useAddressMutations`;
  `toAddressInput` (Task 2); `PhoneInput` from `@ntizo/frontend-ui`; `isValidPhoneNumber` and
  `toMpesaMsisdn` exactly as `details-page.tsx` imports them.
- Produces: `<AcceptQuotePage quoteId />`; on success
  `navigate({ to: "/bookings/$bookingId", params: { bookingId } })` — the customer's booking detail,
  **not** checkout's `/booking/$bookingId/confirm`. Both render a `PENDING_PAYMENT` booking, but the
  checkout page wears the three-step checkout header, and a quote acceptance is not checkout step 3.
  The booking detail already offers "Pagar" on a `PENDING_PAYMENT` row (`canPay` in
  `features/bookings/domain/status.ts`), which is exactly what the mockup's own copy points at:
  "pode voltar a pedi-lo a partir da reserva com «Pagar agora»".

- [ ] **Step 1: Write the failing test**

```tsx
it("summarises exactly what is being agreed, and nothing else", async () => {
  await renderAccept(proposedDetail);
  expect(await screen.findByText("Instalação de ar condicionado")).toBeInTheDocument();
  expect(screen.getByText("9.800,00 MZN")).toBeInTheDocument();
  expect(screen.getByText(/Sábado, 20 de Setembro/)).toBeInTheDocument();
});

it("prefills the phone from the profile rather than asking again", async () => {
  await renderAccept(proposedDetail, { user: { phoneNumber: "+258841234021" } });
  expect(await screen.findByLabelText("Número M-Pesa")).toHaveValue("+258 84 123 4021");
});

it("refuses a non-Vodacom number with the reason, before any write", async () => {
  await renderAccept(proposedDetail, { user: { phoneNumber: null } });
  await userEvent.type(await screen.findByLabelText("Número M-Pesa"), "+258821234567");
  await userEvent.click(screen.getByRole("button", { name: /Aceitar e pagar/ }));
  expect(await screen.findByRole("alert"))
    .toHaveTextContent("O M-Pesa só funciona em números Vodacom (84 ou 85).");
  expect(fakes.graphql).not.toHaveBeenCalledWith(expect.stringContaining("QuoteAccept"), expect.anything());
});

it("saves the phone before it accepts, never both at once", async () => {
  await renderAccept(proposedDetail, { user: { phoneNumber: "+258841234021" } });
  await userEvent.click(await screen.findByRole("button", { name: /Aceitar e pagar/ }));
  await waitFor(() => expect(operationNames()).toEqual(["UpdateMyProfile", "QuoteAccept"]));
});

it("asks for an address when the request never carried one", async () => {
  await renderAccept({ ...proposedDetail, address: null });
  expect(await screen.findByText("Onde é o trabalho")).toBeInTheDocument();
});

it("replaces the button with an explanation when the slot went while they were deciding", async () => {
  await renderAccept(proposedDetail, { acceptError: "QUOTE_SLOT_TAKEN" });
  await userEvent.click(await screen.findByRole("button", { name: /Aceitar e pagar/ }));
  expect(await screen.findByText("Essa hora deixou de estar livre")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Aceitar e pagar/ })).not.toBeInTheDocument();
});

it("says a lapsed proposal has lapsed, and does not offer to retry it", async () => {
  await renderAccept(proposedDetail, { acceptError: "QUOTE_PROPOSAL_LAPSED" });
  await userEvent.click(await screen.findByRole("button", { name: /Aceitar e pagar/ }));
  expect(await screen.findByRole("alert"))
    .toHaveTextContent("Esta proposta caducou. Peça uma nova ao prestador.");
});
```

- [ ] **Step 2: Run it, watch it fail, write the page**

The two-write order, copied from `use-checkout.ts` and awaited sequentially, never `Promise.all`:

```tsx
const profile = useUpdateMyProfile();
const accept = useAcceptQuote();

async function submit() {
  setRefusal(null);

  const typed = phone.trim();
  if (typed === "") return setRefusal("accept.phoneRequired");
  if (!isValidPhoneNumber(typed)) return setRefusal("accept.phoneInvalid");
  if (!toMpesaMsisdn(typed)) return setRefusal("accept.phoneNotVodacom");

  // The quote may have carried no address — a remote or at-provider service
  // whose provider did not ask. A booking past DRAFT must have one, so it is
  // asked for here instead.
  const chosen = q.address === null
    ? (addresses.data?.find((a) => a.id === addressId) ?? null)
    : null;
  if (q.address === null && chosen === null) return setRefusal("accept.errorAddressRequired");

  try {
    // The number first: a booking that reaches PENDING_PAYMENT without one
    // cannot be charged, and the charge sweep starts the moment the quote
    // commits.
    await profile.mutateAsync({ phoneNumber: typed });
    const { bookingId } = await accept.mutateAsync({
      quoteId, ...(chosen ? { address: toAddressInput(chosen) } : {}),
    });
    await navigate({ to: "/bookings/$bookingId", params: { bookingId } });
  } catch (error) {
    const code = error instanceof GraphqlError ? error.code : undefined;
    // A taken slot is not a refusal to retry: the backend has already put the
    // quote back to REQUESTED with a fresh clock and asked the provider again.
    if (code === "QUOTE_SLOT_TAKEN") return setSlotTaken(true);
    setRefusal(
      code === "QUOTE_PROPOSAL_LAPSED" ? "accept.errorLapsed"
      : code === "QUOTE_TRANSITION" ? "accept.errorMoved"
      : code === "QUOTE_ADDRESS_REQUIRED" ? "accept.errorAddressRequired"
      : "accept.errorGeneric",
    );
  }
}
```

When `slotTaken` is true the page renders `accept.slotTakenTitle`, `accept.slotTakenBody` and a link
back to `/quotes/$quoteId` **in place of** the submit button — there is nothing to press.

The rest of the layout follows `confirm-page.tsx`: a `<dl>` of Serviço / Prestador / Quando / Onde /
Inclui / Total a pagar; the phone block with `PhoneInput` and its `aria-describedby` hint; the one
filled button plus `Voltar`; and a rail of the three numbered steps with `accept.nextFooter`
underneath.

Route:

```tsx
// apps/frontend/web/src/routes/_customer/quotes.$quoteId.accept.tsx
export const Route = createFileRoute("/_customer/quotes/$quoteId/accept")({ component: Accept });
function Accept() {
  const { quoteId } = Route.useParams();
  return <AcceptQuotePage key={quoteId} quoteId={quoteId} />;
}
```

- [ ] **Step 3: Run, lint, typecheck, commit**

```bash
cd apps/frontend/web && bunx vitest run src/features/quotes && bun run lint && bun run typecheck
cd ../../.. && git add apps/frontend/web/src/features/quotes apps/frontend/web/src/routes/_customer
git commit -m "feat(web): accepting a proposal saves the number, creates the booking, and says what happens next"
```

---

### Task 11: The provider's data layer, viewmodel, and place in the console

Everything the two provider screens stand on, plus the nav item and the amber badge. Batched
because the nav item is meaningless without the count and the count is meaningless without the
query.

**Files:**
- Create: `apps/frontend/web/src/features/provider/quotes/data/quote.repository.ts`
- Create: `apps/frontend/web/src/features/provider/quotes/viewmodel/use-provider-quotes.ts`
- Modify: `apps/frontend/web/src/shared/lib/console-nav.ts`
- Modify: `apps/frontend/web/src/shared/lib/__tests__/console-nav.test.ts`
- Modify: `apps/frontend/web/src/shared/components/console/console-counts.tsx`
- Modify: `apps/frontend/web/src/shared/locales/*/provider.json` (×8) — `nav.quotes`,
  `navShort.quotes`
- Test: `apps/frontend/web/src/features/provider/quotes/data/__tests__/quote.repository.test.ts`

**Interfaces:**
- Consumes: `QUOTES_PAGE_SIZE` (Task 3); `sessionGraphql`.
- Produces:
  ```ts
  PROVIDER_QUOTE_FIELDS, PROVIDER_QUOTE_DETAIL_FIELDS: string
  providerQuoteQueries.page({ providerId, tab, offset })
  providerQuoteQueries.detail(providerId, quoteId)
  providerQuoteQueries.counts(providerId)
  proposeQuote(input): Promise<{ validUntil: string | null }>
  declineQuote(input): Promise<{ applied: boolean }>
  useProviderQuotes, useProviderQuote, useQuoteToAnswerCount, useAnswerQuote
  type ProviderQuoteDTO, ProviderQuoteDetailDTO, ProviderQuotePageDTO
  ConsoleCountSource gains "quoteRequests"
  ```

- [ ] **Step 1: Write the failing repository test**

Mirror Task 4's, asserting: the detail set asks for `commissionBps` and `performers { id firstName }`;
it never asks for a customer surname, phone, email or street line, because the read model has none
and a selection that names one is a query the server rejects; the query keys are
`["provider", providerId, "quotes", tab, offset]`, `["provider", providerId, "quote", quoteId]` and
`["provider", providerId, "quote-counts"]`; all three carry `enabled: providerId !== ""`; and
`proposeQuote` resolves `{ validUntil: null }` without throwing when the compare-and-swap lost.

- [ ] **Step 2: Write the repository**

Same construction as Task 4 with the provider's selection sets and these two writes:

```ts
const PROPOSE = `
  mutation QuotePropose($input: QuoteProposeInput!) {
    quotePropose(input: $input) { quoteId validUntil }
  }`;

const DECLINE = `
  mutation QuoteDecline($input: QuoteDeclineInput!) {
    quoteDecline(input: $input) { quoteId applied }
  }`;

export interface ProposeQuoteInput {
  quoteId: string;
  priceMinor: number;
  /** ISO 8601 with an offset. Built from the date and time fields in the provider's own zone. */
  startsAt: string;
  durationMinutes: number;
  providerMemberId: string;
  note?: string;
  attachments?: { storageKey: string }[];
}

/**
 * `validUntil: null` is the compare-and-swap saying it lost — the quote moved
 * on between the read and the write, most often because the customer accepted
 * or withdrew while the form was open. Not an error: the provider did nothing
 * wrong, and the page reloads and says so.
 */
export async function proposeQuote(input: ProposeQuoteInput): Promise<{ validUntil: string | null }> {
  const d = await sessionGraphql<{ quotePropose: { quoteId: string; validUntil: string | null } }>(
    PROPOSE,
    {
      input: {
        quoteId: input.quoteId,
        priceMinor: input.priceMinor,
        startsAt: input.startsAt,
        durationMinutes: input.durationMinutes,
        providerMemberId: input.providerMemberId,
        ...(input.note ? { note: input.note } : {}),
        ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
      },
    },
  );
  return { validUntil: d.quotePropose.validUntil };
}
```

`declineQuote` follows `rejectQuote` exactly, with `QuoteProviderDeclineReason`.

- [ ] **Step 3: Write the viewmodel**

```ts
export function useProviderQuotes(input: { providerId: string; tab: ProviderQuoteTab; offset: number }) {
  return useQuery(providerQuoteQueries.page(input));
}

export function useProviderQuote(providerId: string, quoteId: string) {
  return useQuery(providerQuoteQueries.detail(providerId, quoteId));
}

/**
 * The sidebar badge. Mirrors `useAwaitingCount` — a `select` down to one
 * number, and 0 rather than undefined while it loads, because a badge that
 * flickers from nothing to 3 reads as an arrival.
 */
export function useQuoteToAnswerCount(providerId: string | undefined) {
  const query = useQuery({
    ...providerQuoteQueries.counts(providerId ?? ""),
    select: (counts) => counts.toAnswer,
  });
  return query.data ?? 0;
}

/**
 * Both writes invalidate the whole `["provider", providerId]` prefix — the
 * list, the detail and the badge all sit under it — and neither writes
 * optimistically. The refetch is the only honest witness of who won the
 * compare-and-swap.
 */
export function useAnswerQuote(providerId: string) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["provider", providerId] });
  return {
    propose: useMutation({ mutationFn: (v: ProposeQuoteInput) => proposeQuote(v), onSettled: invalidate }),
    decline: useMutation({
      mutationFn: (v: DeclineQuoteInput) => declineQuote(v),
      onSettled: invalidate,
    }),
  };
}
```

- [ ] **Step 4: Add the nav item and demote availability**

In `console-nav.ts`: add `"quoteRequests"` to `ConsoleCountSource`, and insert the item into
`WORKSPACE.work` **between bookings and messages**, taking `primary` off `availability`:

```ts
work: [
  { key: "bookings", titleKey: "nav.bookings", shortKey: "navShort.bookings",
    url: "/provider/$slug/bookings", icon: CalendarCheck, primary: true, count: "bookingRequests" },
  { key: "quotes", titleKey: "nav.quotes", shortKey: "navShort.quotes",
    url: "/provider/$slug/quotes", icon: FileText, primary: true, count: "quoteRequests" },
  { key: "messages", titleKey: "nav.messages", shortKey: "navShort.messages",
    url: "/provider/$slug/messages", icon: MessageSquare, primary: true, count: "unreadThreads" },
  // Availability keeps its place in the sidebar and the sheet but gives up the
  // phone's tab bar: a request with a 48-hour clock on it is owed sooner than
  // a week of availability is, and PRIMARY_TAB_COUNT stays 3.
  { key: "availability", titleKey: "nav.availability", url: "/provider/$slug/availability", icon: CalendarClock },
  { key: "services", titleKey: "nav.services", url: "/provider/$slug/services", icon: Briefcase },
],
```

Keep every existing property of the items you are not changing — read the file and edit in place
rather than retyping it.

`console-nav.test.ts:127-138` asserts the primaries by name. Update that expectation to
`["bookings", "quotes", "messages"]` and leave the `PRIMARY_TAB_COUNT` invariant alone: it is still
3, which is the point.

- [ ] **Step 5: Feed the count**

In `console-counts.tsx`'s `WorkspaceCounts`:

```tsx
const quoteRequests = useQuoteToAnswerCount(providerId);
const value = useMemo<ConsoleCounts>(
  () => ({ unreadThreads, bookingRequests, quoteRequests }),
  [unreadThreads, bookingRequests, quoteRequests],
);
```

The sidebar, the tab bar and the menu sheet all read `counts[item.count]`, so all three pick it up
with no further change.

- [ ] **Step 6: Add the two nav labels in eight locales**

`provider.json` gains `nav.quotes` and `navShort.quotes`. pt-MZ: `"Orçamentos"` for both — the word
is already short. en-US: `"Quotes"`. The other six take their own translation.

- [ ] **Step 7: Run the affected suites**

```bash
cd apps/frontend/web
bunx vitest run src/features/provider/quotes src/shared/lib/__tests__/console-nav.test.ts \
  src/shared/locales/__tests__/locales.test.ts src/shared/lib/__tests__/i18n-parity.test.ts
bun run lint && bun run typecheck
```

Expected: PASS. A `console-nav` failure that still names `availability` as a primary is the
expectation you were told to change; a failure about the count of primaries means an item kept
`primary: true` that should not have.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/src/features/provider/quotes apps/frontend/web/src/shared
git commit -m "feat(web): «Orçamentos» takes availability's place on the phone's tab bar, with the count of what is owed"
```

---

### Task 12: `/provider/$slug/quotes` — the queue

Plate 6. Three tabs, the owed ones first, and rows that let the provider decide whether to open one.

**Files:**
- Create: `apps/frontend/web/src/features/provider/quotes/ui/quote-row.tsx`
- Create: `apps/frontend/web/src/features/provider/quotes/ui/quotes-page.tsx`
- Create: `apps/frontend/web/src/routes/provider/$slug/quotes.index.tsx`
- Test: `apps/frontend/web/src/features/provider/quotes/ui/__tests__/quotes-page.test.tsx`

**Interfaces:**
- Consumes: `useProviderQuotes` (Task 11); `useActiveProvider` from
  `@/features/provider/viewmodel/use-active-provider`; `QuoteStatusLine` (Task 8); `payoutMinorOf`
  (Task 3); `formatMoney`; `CollectionCard`.
- Produces: `quoteColumns(t)`, `quoteRow(q, ctx)`.

- [ ] **Step 1: Write the failing test**

```tsx
it("leads a row with the customer's first name and the service, not an id", async () => {
  await renderQueue(pageWith(toAnswerQuote));
  const r = await row("Instalação de ar condicionado");
  expect(within(r).getByText("Salif F.")).toBeInTheDocument();
});

it("shows where the job is as bairro and city, and nothing finer", async () => {
  await renderQueue(pageWith(toAnswerQuote));
  const r = await row("Instalação de ar condicionado");
  expect(within(r).getByText(/Bairro Central, Maputo/)).toBeInTheDocument();
  expect(within(r).queryByText(/Av\. Julius Nyerere/)).not.toBeInTheDocument();
});

it("counts the photos rather than loading them into a list row", async () => {
  await renderQueue(pageWith({ ...toAnswerQuote, attachmentCount: 3 }));
  expect(within(await row("Instalação de ar condicionado")).getByText("3 fotos")).toBeInTheDocument();
});

it("says how long is left to answer, and how long ago it was asked", async () => {
  await renderQueue(pageWith(toAnswerQuote));
  const r = await row("Instalação de ar condicionado");
  expect(within(r).getByText(/faltam 22 h/)).toBeInTheDocument();
  expect(within(r).getByText(/pedido há 26 h/)).toBeInTheDocument();
});

it("shows what the provider takes home under a sent proposal's price", async () => {
  await renderQueue(pageWith(waitingQuote), { tab: "waiting" });
  const r = await row("Instalação de ar condicionado");
  expect(within(r).getByText("5.400,00 MZN")).toBeInTheDocument();
  expect(within(r).getByText("recebe 4.860,00 MZN")).toBeInTheDocument();
});

it("counts all three tabs on the tabs themselves", async () => {
  await renderQueue(pageWith(toAnswerQuote, { counts: { toAnswer: 3, waiting: 2, history: 11 } }));
  expect(await screen.findByRole("tab", { name: /Por responder/ })).toHaveTextContent("3");
  expect(screen.getByRole("tab", { name: /Histórico/ })).toHaveTextContent("11");
});
```

- [ ] **Step 2: Run it, watch it fail, write the row and the page**

`quote-row.tsx` exports two pure functions, not components, exactly as `booking-row.tsx` does:

```tsx
export function quoteColumns(t: TFunction): CollectionColumn[] { /* customer, service, status, price */ }

export function quoteRow(q: ProviderQuoteDTO, ctx: {
  slug: string; locale: string; now: Date; t: TFunction;
}): CollectionRow {
  return {
    key: q.id,
    primary: (
      <Link to="/provider/$slug/quotes/$quoteId" params={{ slug: ctx.slug, quoteId: q.id }}>
        {/* customer initial avatar, first name, service name, then the
            location · deadline · photo count line, then the snippet */}
      </Link>
    ),
    cells: { /* … */ },
  };
}
```

The price cell, when there is a live proposal — this is the number the provider actually cares
about, so it sits under the customer's price rather than replacing it:

```tsx
<>
  <p className="type-body-medium tabular-nums">{formatMoney(p.priceMinor, p.currency, locale)}</p>
  <p className="type-caption tabular-nums text-[var(--color-muted-foreground)]">
    {t("provider.receives", {
      amount: formatMoney(payoutMinorOf(p.priceMinor, commissionBps), p.currency, locale),
    })}
  </p>
</>
```

`commissionBps` is **not** on `providerQuoteReadModel` — only on the detail. For the list, read it
from the console shell's provider detail (`useProviderDetail(activeProvider?.id)`, which
`console-strip.tsx` already loads and which therefore costs nothing extra here) and skip the
"recebe" line when it is not yet known, rather than showing a wrong number.

The page follows `features/provider/bookings/ui/bookings-page.tsx`: tab from
`useSearch({ strict: false })` defaulted to `"toAnswer"`, the render-time reset keyed on
`` `${providerId}|${tab}` ``, the accumulating pager, one `now`, one `CollectionCard`. No search box
and no filter sheet — the provider queue is three tabs and at most a page or two, and neither the
mockup nor the spec asks for either.

The blurb under the title is `t("provider.blurb", { count, oldest })` where `oldest` is
`coarseDuration(now - the oldest REQUESTED row's requestedAt)`, and `t("provider.blurbNone")` when
the `toAnswer` count is zero.

Route:

```tsx
// apps/frontend/web/src/routes/provider/$slug/quotes.index.tsx
export const Route = createFileRoute("/provider/$slug/quotes/")({
  validateSearch: (search: Record<string, unknown>): { tab?: ProviderQuoteTab } =>
    PROVIDER_QUOTE_TABS.includes(search["tab"] as ProviderQuoteTab)
      ? { tab: search["tab"] as ProviderQuoteTab }
      : {},
  component: ProviderQuotesPage,
});
```

- [ ] **Step 3: Run, lint, typecheck, commit**

```bash
cd apps/frontend/web && bunx vitest run src/features/provider/quotes && bun run lint && bun run typecheck
cd ../../.. && git add apps/frontend/web/src/features/provider/quotes apps/frontend/web/src/routes/provider
git commit -m "feat(web): the provider's quote queue, owed answers first"
```

---

### Task 13: `/provider/$slug/quotes/$quoteId` — reading the job, writing the proposal

Plates 7 and 7b. Everything the customer sent, at full size, on the left; the proposal form with the
split on the right. Sending is the page's one blue button; declining is text.

**Files:**
- Create: `apps/frontend/web/src/features/provider/quotes/ui/quote-page.tsx`
- Create: `apps/frontend/web/src/features/provider/quotes/ui/proposal-form.tsx`
- Create: `apps/frontend/web/src/routes/provider/$slug/quotes.$quoteId.tsx`
- Test: `apps/frontend/web/src/features/provider/quotes/ui/__tests__/proposal-form.test.tsx`
- Test: `apps/frontend/web/src/features/provider/quotes/ui/__tests__/quote-page.test.tsx`

**Interfaces:**
- Consumes: `useProviderQuote`, `useAnswerQuote` (Task 11); `commissionMinorOf`, `payoutMinorOf`,
  `canPropose`, `canDecline`, `revisionCount` (Task 3); `CloseQuoteDialog` (Task 9);
  `QuoteAttachmentList`, `QuoteAttachmentPicker` (Task 5); `useAttachments` (messaging);
  `formatCommission` from `@/shared/domain/commission-format`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing form test**

The split is the form's reason for existing, so it is what the test is mostly about.

```tsx
it("shows the split the moment a price is typed, from the provider's own rate", async () => {
  render(<ProposalForm commissionBps={1000} currency="MZN" performers={[{ id: "m1", firstName: "Carlos" }]}
    timezone="Africa/Maputo" onSubmit={vi.fn()} busy={false} />);
  await userEvent.type(await screen.findByLabelText("Preço para o cliente"), "9800");
  expect(screen.getByText("9.800,00 MZN")).toBeInTheDocument();
  expect(screen.getByText("− 980,00 MZN")).toBeInTheDocument();
  expect(screen.getByText("8.820,00 MZN")).toBeInTheDocument();
});

it("names the rate in the commission line, so the number is not a mystery", async () => {
  render(<ProposalForm commissionBps={1250} … />);
  await userEvent.type(await screen.findByLabelText("Preço para o cliente"), "100");
  expect(screen.getByText(/Comissão Ntizo \(12,5%\)/)).toBeInTheDocument();
});

it("rounds the commission the way the booking will, to the cent", async () => {
  // 5 minor units at 12.5% is 0.625 -> 1, which is Math.round's half-away-from-zero.
  render(<ProposalForm commissionBps={1250} … />);
  await userEvent.type(await screen.findByLabelText("Preço para o cliente"), "0,05");
  expect(screen.getByText("− 0,01 MZN")).toBeInTheDocument();
});

it("sends the price in minor units, never the major number the provider typed", async () => {
  const onSubmit = vi.fn();
  render(<ProposalForm … onSubmit={onSubmit} />);
  await fillValidProposal();
  await userEvent.click(screen.getByRole("button", { name: "Enviar proposta" }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ priceMinor: 980_000 }));
});

it("builds the start from the date and the time in the provider's own zone", async () => {
  const onSubmit = vi.fn();
  render(<ProposalForm timezone="Africa/Maputo" … onSubmit={onSubmit} />);
  await fillValidProposal({ date: "2026-09-20", time: "08:30" });
  await userEvent.click(screen.getByRole("button", { name: "Enviar proposta" }));
  // Africa/Maputo is UTC+2 all year.
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ startsAt: "2026-09-20T06:30:00.000Z" }));
});

it("refuses a price of nothing before it sends", async () => {
  const onSubmit = vi.fn();
  render(<ProposalForm … onSubmit={onSubmit} />);
  await userEvent.click(await screen.findByRole("button", { name: "Enviar proposta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Escreva o preço.");
  expect(onSubmit).not.toHaveBeenCalled();
});

it("preselects the only member rather than making the provider choose from a list of one", async () => {
  render(<ProposalForm performers={[{ id: "m1", firstName: "Carlos" }]} … />);
  expect(await screen.findByLabelText("Quem faz o trabalho")).toHaveValue("m1");
});
```

- [ ] **Step 2: Run it, watch it fail, write the form**

`proposal-form.tsx` is a controlled form that owns no mutation — it hands a `ProposeQuoteInput`
minus the quote id up to the page. The two pieces that carry real decisions:

```tsx
/**
 * The provider types the customer's price and reads their own.
 *
 * "Recebe" is the largest number in the form on purpose: it is the one the
 * provider is deciding on. The arithmetic is `commissionMinorOf`, which is the
 * booking aggregate's expression character for character — showing one number
 * here and paying another is the failure this whole block exists to avoid.
 */
const priceMinor = toMinor(price, currency);
const commission = commissionMinorOf(priceMinor, commissionBps);
const payout = payoutMinorOf(priceMinor, commissionBps);
```

```tsx
/**
 * The date and time as an instant, read in the provider's own zone.
 *
 * `new Date("2026-09-20T08:30")` reads the string in the *browser's* zone, so
 * a provider whose laptop is on Lisbon time would propose an hour earlier than
 * they meant. The offset for the quote's zone at that date is computed and
 * applied instead.
 */
function toInstant(date: string, time: string, timeZone: string): string { /* … */ }
```

Implement `toInstant` with `Intl.DateTimeFormat(… { timeZone, timeZoneName: "longOffset" })` on a
probe date, or by the two-pass `Date.UTC` trick; whichever you choose, the test above pins the
answer for `Africa/Maputo`, and add a second case for a zone with daylight saving (`Europe/Lisbon`,
20 September, UTC+1) so the implementation cannot pass by hard-coding +2.

The rest: price `<input inputMode="decimal">`; the split as a `<dl>` in the shape
`booking-page.tsx:475-500` uses; date `<input type="date">`; time `<input type="time">`; duration as
a number of hours with a minutes fallback; member `<Select>` from `@ntizo/frontend-ui`, preselected
when `performers.length === 1`; the note `<textarea>` with the contact check; the picker; then
`t("propose.validityNote", { hours })` and the one filled button.

- [ ] **Step 3: Write the page**

`quote-page.tsx` follows `features/provider/bookings/ui/booking-page.tsx`: the back link, the four
early returns, a header carrying the customer's first name, the service, the status line and the
deadline, then the two-column grid.

Left column: **O pedido** (the full description, `neededBy`, the location as bairro and city with
`t("provider.whereNote")` under it, and `<QuoteAttachmentList>`); **Quem pede** (first name and
`t("provider.completedBookings", { count })`); **Historial**.

Right column: `<ProposalForm>` when `canPropose(q)`. With a live proposal already sent, the page
shows it as the customer sees it — the price block, "válida até" — with `t("propose.reviseAction")`
as a text button that swaps the form back in. `t("provider.chatWith", { name })` links to the
thread. `t("propose.decline")` opens `<CloseQuoteDialog kind="decline"
reasons={QUOTE_PROVIDER_DECLINE_REASONS} …>` when `canDecline(q)`.

The two writes, with the lost race handled the way the booking page handles its own:

```tsx
async function send(values: Omit<ProposeQuoteInput, "quoteId">) {
  setNotice(undefined);
  const uploaded = await attachments.uploadAll();
  if (uploaded === null) return;
  try {
    const { validUntil } = await answer.propose.mutateAsync({
      quoteId, ...values,
      ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
    });
    // null means the compare-and-swap lost: the customer accepted, withdrew or
    // the clock ran out while this form was open. The refetch is already
    // queued; all that is left is to not say it was sent.
    if (validUntil === null) return setNotice("propose.errorMoved");
    setEditing(false);
  } catch (error) {
    const code = error instanceof GraphqlError ? error.code : undefined;
    setNotice(PROPOSE_ERROR_COPY[code ?? ""] ?? "propose.errorGeneric");
  }
}

const PROPOSE_ERROR_COPY: Record<string, string> = {
  QUOTE_PRICE_BELOW_MINIMUM: "propose.errorPriceBelowMinimum",
  QUOTE_STARTS_IN_PAST: "propose.errorStartsInPast",
  QUOTE_DURATION_INVALID: "propose.errorDurationInvalid",
  QUOTE_MEMBER_CANNOT_PERFORM: "propose.errorMemberCannotPerform",
  QUOTE_SLOT_OVERLAP: "propose.errorSlotOverlap",
  QUOTE_TRANSITION: "propose.errorMoved",
  CONTACT_DETECTED: "propose.errorContact",
};
```

Page test, the four that matter:

```tsx
it("shows the whole description, not the snippet the list shows", async () => { /* … */ });
it("never shows a street line, a phone or an email before the booking is confirmed", async () => {
  await renderProviderQuote(toAnswerDetail);
  expect(screen.queryByText(/Av\. Julius Nyerere/)).not.toBeInTheDocument();
  expect(screen.queryByText(/@/)).not.toBeInTheDocument();
});
it("swaps the form for the proposal once one is sent, and offers to revise it", async () => { /* … */ });
it("says it reloaded rather than claiming the proposal was sent, when the race is lost", async () => {
  await renderProviderQuote(toAnswerDetail, { proposeValidUntil: null });
  await fillAndSend();
  expect(await screen.findByRole("alert"))
    .toHaveTextContent("Este pedido mudou entretanto. Voltámos a carregá-lo.");
});
```

Route:

```tsx
// apps/frontend/web/src/routes/provider/$slug/quotes.$quoteId.tsx
export const Route = createFileRoute("/provider/$slug/quotes/$quoteId")({ component: Quote });
function Quote() {
  const { quoteId } = Route.useParams();
  return <ProviderQuotePage key={quoteId} quoteId={quoteId} />;
}
```

- [ ] **Step 4: Run, lint, typecheck, commit**

```bash
cd apps/frontend/web && bunx vitest run src/features/provider/quotes && bun run lint && bun run typecheck
cd ../../.. && git add apps/frontend/web/src/features/provider/quotes apps/frontend/web/src/routes/provider
git commit -m "feat(web): the provider reads the job at full size and writes the price beside what they take home"
```

---

### Task 14: The whole flow, end to end

Thirteen tasks of screens that were each tested alone. This one proves they join up, and is the only
task that runs anything outside `apps/frontend/web`.

**Files:** none created. Fixes go in whichever file the failure names.

- [ ] **Step 1: The whole suite, from the repository root**

```bash
bun run test
bun run check-types
bun run lint
```

Expected: green. Two admin backend tests (`statsForAdmin`, `unclosed`) count rows in the shared dev
database and fail intermittently when another session is writing; re-run those two alone to tell a
real failure from a neighbour, and say which you saw in the report.

- [ ] **Step 2: Walk the flow against dev**

The backend is already deployed, so a local web against `https://dev.api.ntizo.co.mz` exercises the
real thing.

```bash
cd apps/frontend/web && bun run dev
```

Then, signed in as a customer, walk: a quote-mode service's page → "Pedir orçamento" →
send a request → `/quotes` shows it as "À espera de proposta" → the provider console shows the amber
badge and the row under "Por responder" → send a proposal → the customer's row becomes "Proposta
recebida" with the price → open it → accept → land on the booking at `PENDING_PAYMENT`.

Then walk the refusals: a provider decline with a reason and a file, a customer reject, a customer
withdraw. Confirm each one reaches the other side's history with the reason readable in that side's
own language.

**Clean up every row you create in the shared dev database** — the quotes, their proposals, their
attachments and any booking an acceptance created. Other sessions read that database.

- [ ] **Step 3: Check the phone**

Resize to 390 px and confirm: the customer detail puts the proposal first with the two actions
reachable; the provider tab bar shows Reservas, Orçamentos, Mensagens and the menu button, with
Disponibilidade in the sheet; no page scrolls sideways.

- [ ] **Step 4: Report, then commit anything you fixed**

Write down what you walked, what you found, and what you cleaned up. Commit any fix with a message
naming the screen it was on.

---

## Self-review

**Spec coverage.** Every line of the spec's "The screens" section maps to a task: the service panel
and the browse row to Task 6; `/quote/$serviceId` to Task 7; `/quotes` and the nav entry to Task 8;
`/quotes/$quoteId` to Task 9; `/quotes/$quoteId/accept` to Task 10; the sidebar item, its count and
the `PRIMARY_TAB_COUNT` decision to Task 11; `/provider/$slug/quotes` to Task 12;
`/provider/$slug/quotes/$quoteId` with the split and the decline dialog to Task 13; the `quotes`
locale namespace in eight locales with both parity gates to Task 1. BR-Q8 (the reveal rule) is
asserted in Tasks 4, 11 and 13. BR-Q2 (the contact detector) is asserted in Tasks 7, 9 and 13.

**Two spec items are deliberately not built**, and both are recorded under Deviations with their
reasons: the provider's live availability line on the proposal form, and the rating and job count on
the customer's quote detail.

**One thing the spec's error list is missing.** The backend can answer `QUOTE_CONCURRENTLY_CHANGED`
in places, and it is not in the spec's list of codes. Every page in this plan falls back to its own
generic sentence for an unrecognised code, so an unlisted code degrades to "tente outra vez" rather
than a blank screen. If it turns up during Task 14, add it to the same branch as `QUOTE_TRANSITION`.

**One known backend gap this plan does not close.** A customer can accept while the provider is
revising and buy a superseded price: the compare-and-swap guards on status alone and a revision is
`PROPOSED → PROPOSED`. The smallest fix is pinning the live proposal's id into that predicate, and
it needs no migration. It is backend work, out of this plan's scope, and Task 13's `validUntil: null`
handling is the closest the web can get to it from here.

**Type consistency.** `QuoteAttachmentDTO`, `QuoteProposalDTO`, `AddressInput`,
`ProposeQuoteInput` and `CloseQuoteInput` are each defined once, in Tasks 2, 4 and 11, and every
later use names them exactly. `QuoteStatusLine` is defined in Task 8 and consumed by Tasks 12 and
13 with the same three props. `CloseQuoteDialog` is defined in Task 9 with a `kind` of
`"reject" | "withdraw" | "decline"` and Task 13 uses the third.
