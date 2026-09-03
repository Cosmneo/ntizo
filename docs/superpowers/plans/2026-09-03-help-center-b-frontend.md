# Help Center, Plan B — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a floating "?" opens the Help Center on every customer-facing page — search the FAQ, write to support, find your past requests and read the platform's replies — `/help` answers the same twenty questions to anyone, the two missing footer links come back, and an admin works the queue at `/admin/support`.

**Architecture:** One new feature folder `features/help-center` (`domain / data / viewmodel / ui`) whose panel state lives in a context mounted once in `__root.tsx`; it reuses the messaging feature's `ThreadView` and `MessageComposer` rather than drawing its own conversation. FAQ structure lives in code and its text in a new `help` i18n namespace, so `/help` prerenders and the panel's search runs client-side over `t()`. The admin queue is a second `features/admin/support` feature on the `admin/contact` pattern. Plan A's backend is merged and deployed: nothing here changes the backend.

**Tech Stack:** React 19, TanStack Start/Router (file routes, `ssr` per route, prerender via `vite.config.ts`), TanStack Query, react-i18next (8 locales), Tailwind v4 + `@ntizo/frontend-ui`, vitest + @testing-library/react, Playwright (`apps/e2e`).

**Spec:** `docs/superpowers/specs/2026-09-02-help-center-design.md` — sections *Frontend — Help Center*, *Public `/help` page*, *Entry points*, *Messaging inbox changes*, *Admin*, *`Sheet` becomes modal*, *i18n and FAQ content*, *Testing*. Plan A (`2026-09-02-help-center-a-support-backend.md`) is merged; the FAQ text is `docs/superpowers/specs/2026-09-02-faq-content.md`.

## Global Constraints

- **The wire is fixed and verified** (plan A, commit `5b7bfea7`, introspected against dev). Queries: `supportRequests({status?, audience?, limit?, cursor?})`, `supportRequest({threadId})`, `supportRequestMessages({threadId, limit?, cursor?})`, `supportOpenCount({})` — all admin-only. Mutations: `communicationOpenSupportRequest({audience, providerId?, subject, body, bookingId?, attachments?}) → {threadId}`, `supportReply({threadId, body, attachments?}) → {id}`, `supportResolve({threadId}) → {threadId, status}`, `supportMarkRead({threadId}) → {marked}`. `communicationMyThreads` / `communicationProviderThreads` take an optional `type: inquiry | support`; their rows carry `type`, nullable `providerId`, and `support: { subject, status, audience, bookingId } | null`; `communicationThreadMessages` rows carry `senderSide: customer | provider | platform`.
- **Subject: 1–120 characters after trim. Body: ≤ 4000** (`MESSAGE_BODY_MAX_LENGTH`). Attachments: at most `MAX_ATTACHMENTS`.
- **Contact detection (`hasContact`) must NOT run on support threads** — the composer gets a prop; it stays on for inquiries.
- **Platform replies render as "Suporte Ntizo"**, never an admin's personal name. A message's side comes from `senderSide`, never from comparing user ids, on any support thread.
- **The launcher is hidden on `/admin/*`, `/book/*` and `/booking/*/confirm`**, and shown everywhere else including `/provider/*`.
- **FAQ text is the approved copy in `docs/superpowers/specs/2026-09-02-faq-content.md`** — twenty answers, three categories, pt-MZ and en-US authored. Do not rewrite it. The other six locales get the chrome translated and fall back to en-US for the answers (`i18n.ts`'s `fallbackLng` map does this per key).
- **Eight locales, identical key sets.** `apps/frontend/web/src/shared/lib/__tests__/i18n-parity.test.ts` compares every dotted leaf key AND its interpolation placeholders across all eight; a new namespace missing from one locale turns it red.
- **`eslint-plugin-boundaries` with `no-unknown-files: "error"`.** Layers: `domain` ← `data` ← `viewmodel` ← `ui` ← `routes`; `shared` may import only `domain`/`shared`. **`ui` must never import `data`** — a screen reaches its query through a `viewmodel` hook. Every new file must sit under `src/features/*/{domain,data,viewmodel,ui}/**`, `src/shared/**` or `src/routes/**`.
- **Web tests run vitest** (`bun run test` in `apps/frontend/web`), split into two projects: `web` excludes `src/routes/__tests__/**`, `routes` includes only those. `packages/frontend` has its own vitest. Backend suites are untouched by this plan.
- Gates per touched package: `bun run typecheck` and `bun run test`. Lint with `bun run lint --force` at the **repo root** only.
- Stage by explicit path, never `git add -A`. Do not run `prettier`.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01STPRcx67c6isnqGFZB85xZ
  ```
- Known-red before you start: nothing. `apps/frontend/web` is green at 1809 tests; `packages/frontend` green.

---

## File Structure

**Shared UI kit** (`packages/frontend/src/components/`)
- `sheet.tsx` — gains focus trap, Escape, focus restore, `role="dialog"` + `aria-modal`, and a backdrop above `MobileNav`
- `__tests__/sheet.test.tsx` — new, the primitive's first test

**Help Center feature** (`apps/frontend/web/src/features/help-center/`)
- `domain/faq.ts` — category and question ids, `popular` flags, `FAQ_CATEGORIES`
- `domain/faq-search.ts` — `searchFaq(entries, query)`, diacritic-insensitive
- `domain/help-audience.ts` — `audienceForPath(pathname)` → `{ audience, providerSlug }`
- `data/support.repository.ts` — `openSupportRequest`, `supportQueries.myRequests/providerRequests`
- `viewmodel/use-help-center.ts` — the context, `HelpCenterProvider`, `useHelpCenter()`
- `viewmodel/use-support-requests.ts` — the list for the current audience
- `viewmodel/use-open-support-request.ts` — the mutation
- `ui/help-launcher.tsx`, `ui/help-panel.tsx`, `ui/help-home.tsx`, `ui/help-faq.tsx`, `ui/help-requests.tsx`, `ui/help-new-request.tsx`, `ui/help-conversation.tsx`, `ui/help-center.tsx` (composes launcher + panel)
- `ui/faq-accordion.tsx` — shared by the panel and `/help`
- `ui/help-page.tsx` — the public `/help` page
- tests under `domain/__tests__/`, `viewmodel/__tests__/`, `ui/__tests__/`

**Admin support feature** (`apps/frontend/web/src/features/admin/support/`)
- `data/admin-support.repository.ts`, `viewmodel/use-admin-support.ts`
- `ui/support-page.tsx` (the queue), `ui/support-request-page.tsx` (one request)
- `ui/__tests__/support-page.test.tsx`, `ui/__tests__/support-request-page.test.tsx`

**Messaging changes** (`apps/frontend/web/src/features/messaging/`)
- `domain/types.ts` — `Thread` gains `type`, nullable `providerId`, `support`; `Message` gains `senderSide`
- `data/messaging.repository.ts` — the three selection sets gain the new fields; `mine`/`forProvider` take an optional `type`
- `viewmodel/use-threads.ts`, `use-provider-threads.ts` — drop the `?? ""` degrade, pass `type`
- `ui/thread-list.tsx` — a support row's label and status pill
- `ui/thread-view.tsx` — `senderSide === "platform"` renders as "Suporte Ntizo"
- `ui/message-composer.tsx` — `checkContact` prop

**Routes** (`apps/frontend/web/src/routes/`)
- `help.tsx` (new, `ssr: true`, prerendered), `admin/support.tsx`, `admin/support.$threadId.tsx` (new)
- `__root.tsx` — mounts `HelpCenterProvider` + `HelpCenter`

**Shared** (`apps/frontend/web/src/shared/`)
- `lib/zones.ts` — `showsHelpLauncher(pathname)`
- `lib/admin-navigation.ts` — the Suporte entry
- `locales/*/help.json` — 8 new files; `locales/*/{landing,messaging,admin,notifications,company}.json` — new keys
- `lib/i18n.ts` — the `help` namespace

**Other**
- `features/landing/ui/footer.tsx` + its test — two links
- `features/company/ui/company-page.tsx` — `help` in `STRIP`
- `features/checkout/ui/details-page.tsx` — "help with this booking"
- `features/notifications/domain/notification-presentation.ts` — four types
- `apps/frontend/web/vite.config.ts` — `/help` prerendered
- `apps/e2e/tests/help-center.spec.ts` — the round trip
- `docs/superpowers/follow-ups.md` — close #137, #139, #141; open what is left

---

## Task 1: `Sheet` becomes a dialog

**Files:**
- Modify: `packages/frontend/src/components/sheet.tsx`
- Create: `packages/frontend/src/components/__tests__/sheet.test.tsx`

**Interfaces:**
- Produces: `SheetContent` gains `labelledBy?: string` and behaves modally — `role="dialog"`, `aria-modal="true"`, Escape closes, focus moves in on open and returns to the trigger on close, Tab cycles inside, the backdrop sits above `MobileNav`.

Closes follow-ups #78 (the `Sheet` half) and #90's sibling complaint about the primitive. `Dialog` is NOT changed here.

- [ ] **Step 1: Write the failing test**

`packages/frontend/src/components/__tests__/sheet.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "../sheet";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" labelledBy="sheet-title">
          <SheetTitle id="sheet-title">Ajuda</SheetTitle>
          <button type="button">first</button>
          <button type="button">last</button>
        </SheetContent>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("is a labelled modal dialog when open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "sheet-title");
  });

  it("moves focus into the panel on open and back to the trigger on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open" });
    await user.click(trigger);

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab inside the panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open" }));

    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    await user.tab();

    // Wrapped back into the panel rather than escaping to the document.
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("closes on a backdrop click", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open" }));

    await user.click(screen.getByTestId("sheet-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/frontend && bun run test -- sheet`
Expected: FAIL — `getByRole("dialog")` finds nothing (the panel has no role), and there is no `sheet-backdrop` test id.

- [ ] **Step 3: Make the panel a modal dialog**

In `packages/frontend/src/components/sheet.tsx`, add `useEffect`/`useRef` to the React import and replace `SheetContent` with:

```tsx
/** Focusable descendants, in document order — what a focus trap and an initial focus both need. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SheetContent({
  className,
  side = "left",
  style,
  labelledBy,
  children,
}: {
  className?: string;
  side?: "left" | "right" | "top" | "bottom";
  style?: React.CSSProperties;
  /** The id of the heading that names this panel — `aria-labelledby`. Without it a screen reader announces an unnamed dialog. */
  labelledBy?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(Ctx)!;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const open = ctx.open;

  // Escape closes, and focus goes where it came from. Both live in one
  // effect because they share the same "who had focus before this opened"
  // reference: capturing it in a second effect would race this one's
  // cleanup on a fast open-close.
  React.useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    // The panel itself when it holds nothing focusable — a dialog that
    // leaves focus on the page behind it is not modal in any sense a
    // keyboard user can tell.
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        ctx.setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === firstEl || active === panelRef.current)) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only if focus is still inside the panel being torn down: a close
      // that already moved focus somewhere deliberate (a navigation) must
      // not have it yanked back.
      if (!returnTo) return;
      if (document.activeElement === document.body || panelRef.current?.contains(document.activeElement)) {
        returnTo.focus();
      }
    };
  }, [open, ctx]);

  if (!open) return null;

  const sideCls =
    side === "left"
      ? "inset-y-0 left-0 h-full border-r"
      : side === "right"
        ? "inset-y-0 right-0 h-full border-l"
        : side === "top"
          ? "inset-x-0 top-0 w-full border-b"
          : "inset-x-0 bottom-0 w-full border-t";

  return (
    <>
      {/* `z-50`, not `z-40`: `MobileNav` is `fixed … z-40` and sits later in
          the document, so at equal z-index it painted over this backdrop and
          stayed tappable behind an open sheet — follow-up #78's second
          defect. The panel goes one higher again. */}
      <div
        data-testid="sheet-backdrop"
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => ctx.setOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
        tabIndex={-1}
        className={cn(
          "fixed z-[60] bg-[var(--color-background)] shadow-lg outline-none",
          sideCls,
          className,
        )}
        style={style}
      >
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run the test again**

Run: `cd packages/frontend && bun run test -- sheet`
Expected: PASS, four tests.

- [ ] **Step 5: Check the existing consumers still behave**

Eight files render `SheetContent` (`features/admin/{providers,users,categories}`, `features/provider/{ui/people-filters,availability/ui/rule-drawer}`, `features/directory/{ui/provider-facets,services/ui/service-facets}`, `shared/components/browse/mobile-search-sheet`). Four of them already wrap their body in a `<div role="dialog" aria-labelledby=…>`; that inner div is now nested inside a `role="dialog"`.

Run: `cd apps/frontend/web && bun run test`
Expected: PASS (1809 before this plan). If a test now finds two dialogs where it expected one, fix it by removing the **inner** `role="dialog"` (and moving its `aria-labelledby` id onto `SheetContent`'s new `labelledBy`), not by weakening the primitive. `features/provider/availability/ui/rule-drawer.tsx` also carries its own `aria-modal="true"` — remove it there for the same reason.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/sheet.tsx packages/frontend/src/components/__tests__/sheet.test.tsx
git commit -m "fix(ui): the sheet is a dialog — focus, Escape, and a backdrop above the bottom bar"
```

(Stage any consumer files Step 5 made you touch in the same commit.)

---

## Task 2: The FAQ — structure, copy, search

**Files:**
- Create: `apps/frontend/web/src/features/help-center/domain/faq.ts`
- Create: `apps/frontend/web/src/features/help-center/domain/faq-search.ts`
- Create: `apps/frontend/web/src/features/help-center/domain/__tests__/faq-search.test.ts`
- Create: `apps/frontend/web/src/shared/locales/{en-US,pt-MZ,pt-PT,es-ES,de-DE,fr-FR,it-IT,nl-NL}/help.json` (8 files)
- Modify: `apps/frontend/web/src/shared/lib/i18n.ts`

**Interfaces:**
- Produces: `FAQ_CATEGORIES: readonly FaqCategory[]` where `FaqCategory = { id: string; questionIds: readonly string[] }`; `POPULAR_QUESTION_IDS: readonly string[]`; `type FaqEntry = { id: string; categoryId: string; question: string; answer: string }`; `searchFaq(entries: readonly FaqEntry[], query: string): FaqEntry[]`; the `help` i18n namespace with `faq.<categoryId>.title` and `faq.<categoryId>.<questionId>.{q,a}`.

- [ ] **Step 1: Write the structure**

`domain/faq.ts` — ids only; the words live in the namespace so `/help` and the panel share one source and eight locales stay parallel:

```ts
/**
 * The FAQ's shape: which categories exist, in which order, and which
 * questions sit under each.
 *
 * Ids here, words in the `help` namespace (`faq.<category>.<question>.q|a`).
 * Two reasons: the panel and `/help` render the same twenty answers and must
 * not drift, and the i18n parity test then guards the copy in all eight
 * locales the way it guards every other namespace.
 *
 * The text is the approved copy in
 * `docs/superpowers/specs/2026-09-02-faq-content.md` — pt-MZ and en-US
 * authored, the other six falling back to en-US per key through
 * `i18n.ts`'s `fallbackLng` map. Ids are minted here because that document
 * numbers its questions and does not name them.
 */
export interface FaqCategory {
  readonly id: string;
  readonly questionIds: readonly string[];
}

export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  {
    id: "customers",
    questionIds: [
      "howBookingWorks",
      "whenIPay",
      "paymentMethods",
      "priceIsPrice",
      "verifiedBadge",
      "quoteAndHourly",
      "cancelBooking",
      "leaveReview",
    ],
  },
  {
    id: "providers",
    questionIds: [
      "whoCanBe",
      "whatItCosts",
      "whenPaid",
      "verification",
      "team",
      "availability",
      "noAnswer",
    ],
  },
  {
    id: "payments",
    questionIds: [
      "paymentDataStored",
      "shareContact",
      "serviceNotDone",
      "dataHandling",
      "deleteAccount",
    ],
  },
] as const;

/**
 * The four the panel's home screen offers before anyone searches — the
 * questions support actually receives, not the first four in order.
 */
export const POPULAR_QUESTION_IDS: readonly string[] = [
  "whenIPay",
  "paymentMethods",
  "cancelBooking",
  "whenPaid",
] as const;

/** One question with its words resolved — what search and the accordion both take. */
export interface FaqEntry {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
}
```

- [ ] **Step 2: Write the failing search test**

`domain/__tests__/faq-search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { searchFaq } from "../faq-search";
import type { FaqEntry } from "../faq";

const entries: FaqEntry[] = [
  { id: "whenIPay", categoryId: "customers", question: "Quando é que pago?", answer: "Depois de o prestador confirmar a hora." },
  { id: "paymentMethods", categoryId: "customers", question: "Que métodos de pagamento aceitam?", answer: "Neste momento, M-Pesa (Vodacom)." },
  { id: "team", categoryId: "providers", question: "Posso ter uma equipa?", answer: "Sim. Um estabelecimento convida membros por email." },
];

describe("searchFaq", () => {
  it("returns everything for an empty or blank query", () => {
    expect(searchFaq(entries, "")).toHaveLength(3);
    expect(searchFaq(entries, "   ")).toHaveLength(3);
  });

  it("matches the question and the answer", () => {
    expect(searchFaq(entries, "pago").map((e) => e.id)).toEqual(["whenIPay"]);
    expect(searchFaq(entries, "Vodacom").map((e) => e.id)).toEqual(["paymentMethods"]);
  });

  it("ignores case and diacritics, both ways round", () => {
    // Someone typing on a phone keyboard without accents must still find the
    // accented answer, and vice versa.
    expect(searchFaq(entries, "METODOS").map((e) => e.id)).toEqual(["paymentMethods"]);
    expect(searchFaq(entries, "é que pago").map((e) => e.id)).toEqual(["whenIPay"]);
    expect(searchFaq(entries, "equipa").map((e) => e.id)).toEqual(["team"]);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(searchFaq(entries, "helicóptero")).toEqual([]);
  });

  it("keeps the given order", () => {
    expect(searchFaq(entries, "a").map((e) => e.id)).toEqual(["whenIPay", "paymentMethods", "team"]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd apps/frontend/web && bun run test -- faq-search`
Expected: FAIL — module `../faq-search` not found.

- [ ] **Step 4: Write the search**

`domain/faq-search.ts`:

```ts
import type { FaqEntry } from "./faq";

/**
 * Lower-cased and stripped of diacritics, so "metodos" finds "métodos".
 *
 * NFD splits a letter from its accent, and the range strips the combining
 * marks that leaves behind — the whole reason this is not just
 * `toLowerCase()`: this FAQ is authored in Portuguese and read on phone
 * keyboards that make accents an extra tap.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * The FAQ, filtered by what somebody typed — over question and answer both,
 * because people search for the word in the answer ("M-Pesa") as often as
 * for the question.
 *
 * A substring match, not a ranking: twenty entries do not need scoring, and
 * a ranked list whose order changes as you type is harder to read than one
 * that keeps the authored order.
 */
export function searchFaq(entries: readonly FaqEntry[], query: string): FaqEntry[] {
  const needle = fold(query.trim());
  if (needle.length === 0) return [...entries];
  return entries.filter((entry) => fold(`${entry.question} ${entry.answer}`).includes(needle));
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `cd apps/frontend/web && bun run test -- faq-search`
Expected: PASS, five tests.

- [ ] **Step 6: Write the pt-MZ namespace**

`src/shared/locales/pt-MZ/help.json`. The `faq.*` answers are the approved pt-MZ text from `docs/superpowers/specs/2026-09-02-faq-content.md`, copied verbatim; the rest is the panel's chrome:

```json
{
  "launcher": "Ajuda",
  "title": "Central de ajuda",
  "greeting": "Olá 👋 Como podemos ajudar?",
  "close": "Fechar",
  "back": "Voltar",
  "searchLabel": "Procurar na ajuda",
  "searchPlaceholder": "Procurar — cancelamento, pagamento, verificação",
  "searchNoResults": "Não encontrámos nada para «{{query}}».",
  "searchNoResultsAction": "Fale connosco",
  "actionMessage": "Enviar mensagem",
  "actionMessageBody": "Falar com a nossa equipa de suporte",
  "actionRequests": "Os meus pedidos",
  "actionRequestsBody": "Conversas anteriores",
  "popularTitle": "Perguntas frequentes",
  "browseAll": "Ver todas as perguntas",
  "signedOutTitle": "Inicie sessão para falar com o suporte",
  "signedOutBody": "Precisa de uma conta para abrirmos um pedido em seu nome. Se não conseguir entrar, escreva para {{email}}.",
  "signIn": "Iniciar sessão",
  "requestsTitle": "Os meus pedidos",
  "requestsEmptyTitle": "Ainda não escreveu",
  "requestsEmptyBody": "Quando abrir um pedido de suporte, ele aparece aqui.",
  "requestsError": "Não foi possível carregar os seus pedidos.",
  "newRequestTitle": "Enviar mensagem",
  "subjectLabel": "Assunto",
  "subjectPlaceholder": "Em poucas palavras",
  "subjectHint": "{{count}}/120",
  "bookingChip": "Sobre a reserva de {{service}}",
  "bookingChipRemove": "Não é sobre esta reserva",
  "submit": "Enviar",
  "submitting": "A enviar…",
  "audienceProvider": "Em nome de {{provider}}",
  "status": {
    "open": "Aberto",
    "resolved": "Resolvido"
  },
  "resolvedNotice": "Este pedido foi marcado como resolvido. Responda para o reabrir.",
  "platformSender": "Suporte Ntizo",
  "error": {
    "SUPPORT_SUBJECT_INVALID": "O assunto tem de ter entre 1 e 120 caracteres.",
    "SUPPORT_NOT_A_MEMBER": "Não pertence a este prestador.",
    "SUPPORT_BOOKING_NOT_YOURS": "Essa reserva não é sua.",
    "SUPPORT_TOO_MANY_OPEN": "Já tem 10 pedidos abertos. Responda num deles.",
    "MESSAGE_EMPTY": "Escreva a sua mensagem.",
    "UNAUTHENTICATED": "Inicie sessão para falar com o suporte.",
    "GENERIC": "Não foi possível enviar o pedido. Tente novamente."
  },
  "page": {
    "headTitle": "Central de ajuda",
    "eyebrow": "Ajuda",
    "title": "Perguntas frequentes",
    "lede": "As respostas que damos mais vezes. Se a sua não estiver aqui, fale connosco.",
    "contactTitle": "Ainda precisa de ajuda?",
    "contactBody": "Abra um pedido e respondemos por aqui.",
    "contactAction": "Falar com o suporte",
    "contactEmail": "Ou escreva para {{email}}."
  },
  "faq": {
    "customers": {
      "title": "Clientes",
      "howBookingWorks": {
        "q": "Como funciona uma reserva?",
        "a": "Escolhe o serviço, o dia e a hora no calendário do prestador, e diz onde o serviço acontece. O pedido segue para o prestador confirmar. Só depois de ele confirmar a hora recebe o pedido de pagamento no telemóvel."
      },
      "whenIPay": {
        "q": "Quando é que pago?",
        "a": "Depois de o prestador confirmar a hora, e nunca antes. Se ele não responder dentro do prazo indicado no pedido, ou recusar, o pedido é encerrado e não é cobrado nada."
      },
      "paymentMethods": {
        "q": "Que métodos de pagamento aceitam?",
        "a": "Neste momento, M-Pesa (Vodacom). O pedido de pagamento chega ao seu telemóvel e confirma-o com o PIN. Outros métodos estão a caminho."
      },
      "priceIsPrice": {
        "q": "O preço que vejo é o que pago?",
        "a": "Sim. O valor do anúncio é o valor cobrado. A comissão da Ntizo é descontada do lado do prestador, não é somada ao seu."
      },
      "verifiedBadge": {
        "q": "O que significa o selo de verificado?",
        "a": "Que o prestador enviou um documento de identidade (BI, DIRE ou passaporte) e que uma pessoa da Ntizo o reviu antes de o perfil ficar visível."
      },
      "quoteAndHourly": {
        "q": "Alguns serviços dizem «sob orçamento» ou «por hora». Como reservo?",
        "a": "Esses ainda não se reservam directamente. Envie uma mensagem ao prestador a partir da página do serviço para combinar o preço e a hora."
      },
      "cancelBooking": {
        "q": "Posso cancelar uma reserva?",
        "a": "Antes de o prestador confirmar, o pedido ainda não o compromete a nada. Depois de confirmar e pagar, fale com o suporte o quanto antes com a data e o nome do prestador, e tratamos do caso consigo."
      },
      "leaveReview": {
        "q": "Como deixo uma avaliação?",
        "a": "Só quem teve um serviço concluído com um prestador o pode avaliar. Cada pessoa tem uma avaliação por prestador, e pode mudá-la quando quiser."
      }
    },
    "providers": {
      "title": "Prestadores",
      "whoCanBe": {
        "q": "Quem pode ser prestador?",
        "a": "Uma pessoa que oferece o seu próprio trabalho, ou um estabelecimento com equipa. Precisa de um documento de identidade, de um meio para receber (M-Pesa, e-Mola ou conta bancária) e de aceitar os termos."
      },
      "whatItCosts": {
        "q": "Quanto custa?",
        "a": "Registar-se e publicar serviços é gratuito. A Ntizo cobra uma comissão sobre cada serviço pago, descontada do valor que lhe é pago. A sua taxa está indicada na sua área de prestador."
      },
      "whenPaid": {
        "q": "Quando é que recebo?",
        "a": "O cliente paga depois de confirmar a hora, e o valor fica retido até o serviço estar concluído. Depois disso passa para a sua carteira, onde fica disponível para levantar após o período de retenção indicado."
      },
      "verification": {
        "q": "Como funciona a verificação?",
        "a": "Envia um documento de identidade durante o registo. Uma pessoa da Ntizo revê o pedido; até lá o perfil fica pendente e fora dos resultados. Avisamos por email quando estiver aprovado."
      },
      "team": {
        "q": "Posso ter uma equipa?",
        "a": "Sim. Um estabelecimento convida membros por email. Cada um tem a sua disponibilidade, e as horas que os clientes vêem contam com quantas pessoas estão livres."
      },
      "availability": {
        "q": "Como defino a minha disponibilidade?",
        "a": "Define os dias e horas em que trabalha, a duração de cada serviço e o intervalo entre serviços. A Ntizo gera as horas que os clientes podem escolher. Pode bloquear dias específicos."
      },
      "noAnswer": {
        "q": "O que acontece se não responder a um pedido?",
        "a": "Tem um prazo, indicado no pedido, para confirmar ou recusar. Passado esse prazo o pedido expira e o cliente é avisado para escolher outra hora ou outro prestador."
      }
    },
    "payments": {
      "title": "Pagamentos e segurança",
      "paymentDataStored": {
        "q": "Os meus dados de pagamento ficam guardados?",
        "a": "Guardamos o número de telemóvel associado ao M-Pesa ou e-Mola e o país. Não guardamos números de cartão."
      },
      "shareContact": {
        "q": "Posso partilhar o meu número ou email nas mensagens?",
        "a": "As mensagens não permitem números de telefone nem emails. É o que mantém a reserva, o pagamento e a avaliação dentro da plataforma, onde há registo e a quem recorrer."
      },
      "serviceNotDone": {
        "q": "O que acontece se o serviço não for feito?",
        "a": "O pagamento fica retido até o serviço estar concluído. Se algo correr mal, fale com o suporte com a data e o nome do prestador. Analisamos o caso com as duas partes."
      },
      "dataHandling": {
        "q": "Como tratam os meus dados?",
        "a": "Recolhemos só o necessário para ligar clientes e prestadores. Está tudo na Política de Privacidade, escrita para ser lida."
      },
      "deleteAccount": {
        "q": "Como apago a minha conta?",
        "a": "Escreva para privacidade@ntizo.co.mz a partir do email da conta. Apagamos os seus dados, excepto o que a lei nos obriga a guardar, e respondemos no prazo de 30 dias."
      }
    }
  }
}
```

- [ ] **Step 7: Write en-US, then the other six**

`en-US/help.json` — same key set; `faq.*` is the approved en-US text from the same document (Customers / Providers / Payments and safety, in the same order as the ids above), and the chrome translated: `"launcher": "Help"`, `"title": "Help centre"`, `"greeting": "Hi 👋 How can we help?"`, `"searchPlaceholder": "Search — cancellation, payment, verification"`, `"actionMessage": "Send a message"`, `"actionRequests": "My requests"`, `"popularTitle": "Popular questions"`, `"browseAll": "Browse all questions"`, `"platformSender": "Ntizo Support"`, `"status": { "open": "Open", "resolved": "Resolved" }`, `page.title` `"Frequently asked questions"`, and so on for every key.

For `pt-PT`, `es-ES`, `de-DE`, `fr-FR`, `it-IT`, `nl-NL`: translate the **chrome** keys (everything outside `faq.*`) into that language, in the register `messaging.json` and `company.json` already use there. For `faq.*`, **copy the en-US values verbatim** into each file. The parity test compares key sets, not values, so the keys must all exist; copying en-US makes the fallback explicit and reviewable rather than relying on a missing key. pt-PT is the exception: copy the **pt-MZ** `faq.*` values (same language).

Add one line at the top of each non-pt/en file's `faq` object is not possible in JSON — instead record the choice in the plan's follow-up (Task 12) and in the commit message.

- [ ] **Step 8: Register the namespace**

In `apps/frontend/web/src/shared/lib/i18n.ts`: add eight imports next to the `company` ones, following the existing naming (`import enUSHelp from "@/shared/locales/en-US/help.json";` … `import nlNLHelp from "@/shared/locales/nl-NL/help.json";`), add `help: <locale>Help` to each of the eight `resources` lines, and add `"help"` to the `ns` array after `"company"`.

- [ ] **Step 9: Run the gates**

Run: `cd apps/frontend/web && bun run typecheck && bun run test -- i18n-parity faq-search`
Expected: PASS. If parity fails, it names the locale and the missing dotted key — add it rather than deleting the key elsewhere.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/web/src/features/help-center/domain apps/frontend/web/src/shared/locales apps/frontend/web/src/shared/lib/i18n.ts
git commit -m "feat(help): the twenty answers, their ids, and a search that ignores accents"
```

---

## Task 3: The messaging feature learns about support

**Files:**
- Modify: `apps/frontend/web/src/features/messaging/domain/types.ts`
- Modify: `apps/frontend/web/src/features/messaging/data/messaging.repository.ts`
- Modify: `apps/frontend/web/src/features/messaging/viewmodel/use-threads.ts`
- Modify: `apps/frontend/web/src/features/messaging/viewmodel/use-provider-threads.ts`
- Modify: `apps/frontend/web/src/features/messaging/ui/thread-view.tsx`
- Modify: `apps/frontend/web/src/features/messaging/ui/thread-list.tsx`
- Modify: `apps/frontend/web/src/features/messaging/ui/message-composer.tsx`
- Modify: `apps/frontend/web/src/features/messaging/ui/customer-messages-page.tsx`
- Modify: `apps/frontend/web/src/features/messaging/ui/provider-messages-page.tsx`
- Modify: `apps/frontend/web/src/shared/locales/{8}/messaging.json`
- Test: `.../ui/__tests__/thread-view.test.tsx`, `.../ui/__tests__/thread-list.test.tsx`, `.../ui/__tests__/message-composer.test.tsx`, `.../data/__tests__/messaging.repository.test.ts` (all extended)

**Interfaces:**
- Consumes: the wire fields listed in Global Constraints.
- Produces: `Thread { id, type: "inquiry" | "support", providerId: string | null, providerName, customerName, lastMessageAt, lastMessagePreview, lastMessageHasAttachment, unreadCount, support: ThreadSupport | null }` with `ThreadSupport { subject, status: "open" | "resolved", audience: "customer" | "provider", bookingId: string | null }`; `Message` gains `senderSide: "customer" | "provider" | "platform"`; `messagingQueries.mine(type?: ThreadType)` and `.forProvider(providerId, type?)`; `ThreadList` gains nothing (it reads `thread.support` itself); `ThreadView` gains `platformLabel?: string`; `MessageComposer` gains `checkContact?: boolean` (default `true`).

- [ ] **Step 1: Write the failing tests**

In `ui/__tests__/thread-view.test.tsx`, extend `base` with `senderSide: "customer"` and append:

```tsx
  it("labels a platform reply rather than aligning it as the viewer's own", () => {
    render(
      <ThreadView
        messages={[
          { ...base, id: "m1", senderUserId: "customer-1", senderSide: "customer", body: "Paguei duas vezes" },
          { ...base, id: "m2", senderUserId: "admin-9", senderSide: "platform", body: "Já devolvemos o valor." },
        ]}
        viewerUserId="customer-1"
        platformLabel="Suporte Ntizo"
      />,
    );

    expect(screen.getByText("Suporte Ntizo")).toBeInTheDocument();
    // The customer's own message carries no sender label — the label exists
    // to name the platform, not to caption every bubble.
    expect(screen.getAllByText("Suporte Ntizo")).toHaveLength(1);
  });

  it("without a platformLabel, a platform message still renders its body", () => {
    render(<ThreadView messages={[{ ...base, senderSide: "platform" }]} />);
    expect(screen.getByText(base.body)).toBeInTheDocument();
  });
```

In `ui/__tests__/thread-list.test.tsx`, add a support row to the fixture (`type: "support"`, `providerId: null`, `support: { subject: "Reembolso", status: "open", audience: "customer", bookingId: null }`) and:

```tsx
  it("labels a support row with its subject and status instead of a provider name", () => {
    render(<ThreadList {...baseProps} threads={[supportRow]} />);

    expect(screen.getByText("Reembolso")).toBeInTheDocument();
    expect(screen.getByText("Suporte Ntizo")).toBeInTheDocument();
    expect(screen.getByText("Aberto")).toBeInTheDocument();
  });
```

(Use whatever the file already names its props object and its render helper; the English test locale means `"Open"` and `"Ntizo Support"` — check `src/test/setup.ts`, which resolves to `en`, and assert the en-US strings.)

In `ui/__tests__/message-composer.test.tsx`:

```tsx
  it("refuses a phone number by default", async () => {
    const user = userEvent.setup();
    render(<MessageComposer onSend={vi.fn()} />);
    await user.type(screen.getByLabelText(/message body/i), "call me on 84 123 4567");
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
  });

  it("allows one when the check is off — a support thread is where a number belongs", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<MessageComposer onSend={onSend} checkContact={false} />);
    await user.type(screen.getByLabelText(/message body/i), "call me on 84 123 4567");

    const send = screen.getByRole("button", { name: /^send$/i });
    expect(send).toBeEnabled();
    await user.click(send);
    expect(onSend).toHaveBeenCalledWith("call me on 84 123 4567", []);
  });
```

In `data/__tests__/messaging.repository.test.ts`, add to the existing describe:

```ts
  it("asks for the support fields the inbox now renders", () => {
    const doc = messagingQueries.mine().queryKey; // placeholder — see below
    expect(true).toBe(true);
  });
```

Replace that placeholder with the file's own idiom: it spies on `client.sessionGraphql`, so assert on the **document string** the spy was called with —

```ts
  it("asks for the support fields the inbox now renders, and passes the type filter", async () => {
    const spy = vi.spyOn(client, "sessionGraphql").mockResolvedValue({ communicationMyThreads: { items: [], nextCursor: null } } as never);

    await messagingQueries.mine("support").queryFn!({ pageParam: null } as never);

    const [doc, vars] = spy.mock.calls[0]!;
    expect(doc).toContain("type");
    expect(doc).toContain("support { subject status audience bookingId }");
    expect(vars).toEqual({ input: { limit: THREADS_PAGE_SIZE, cursor: null, type: "support" } });
  });

  it("omits the type filter when none is asked for", async () => {
    const spy = vi.spyOn(client, "sessionGraphql").mockResolvedValue({ communicationMyThreads: { items: [], nextCursor: null } } as never);
    await messagingQueries.mine().queryFn!({ pageParam: null } as never);
    expect(spy.mock.calls[0]![1]).toEqual({ input: { limit: THREADS_PAGE_SIZE, cursor: null } });
  });
```

(Match the file's existing way of invoking a `queryFn` — copy the shape from the tests already there rather than the sketch above.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/frontend/web && bun run test -- messaging`
Expected: FAIL — `senderSide` is not on `Message`, `platformLabel`/`checkContact` are not props, the documents do not mention `support`.

- [ ] **Step 3: Widen the domain types**

In `domain/types.ts`, above `Thread`:

```ts
/** What a support row adds to an inbox line. Null on an inquiry. */
export interface ThreadSupport {
  subject: string;
  status: "open" | "resolved";
  audience: "customer" | "provider";
  bookingId: string | null;
}

export type ThreadType = "inquiry" | "support";
```

and inside `Thread`: `type: ThreadType;`, `providerId: string | null;` (replacing `string`, with a doc line: *Null on a personal support request — there is no provider on it*), `support: ThreadSupport | null;`. In `Message`, after `senderUserId`: `senderSide: "customer" | "provider" | "platform";` with a doc line: *Which side wrote it. A support thread aligns and labels by this, never by comparing user ids — an admin's id means nothing to the reader.*

- [ ] **Step 4: Ask the wire for the new fields**

In `data/messaging.repository.ts`, change the three documents' selection sets:

- `MY_THREADS` and `PROVIDER_THREADS`: `items { id type providerId providerName customerName lastMessageAt lastMessagePreview lastMessageHasAttachment unreadCount support { subject status audience bookingId } }`
- `THREAD_MESSAGES`: `items { id threadId senderUserId senderSide body readAt createdAt attachments { id fileName contentType sizeBytes } }`

and give the two inbox queries the filter:

```ts
  /**
   * The caller's own inbox. `type` narrows it — the Help Center's "my
   * requests" passes `"support"`, `/messages` passes nothing and gets both.
   * It rides in the query key too: a filtered list is a different result
   * set, not the same one rendered differently.
   */
  mine: (type?: ThreadType) =>
    infiniteQueryOptions({
      queryKey: ["messaging", "threads", "mine", type ?? "all"] as const,
      queryFn: ({ pageParam }) =>
        sessionGraphql<{ communicationMyThreads: ThreadPageDTO }>(MY_THREADS, {
          input: { limit: THREADS_PAGE_SIZE, cursor: pageParam, ...(type ? { type } : {}) },
        }).then((d) => d.communicationMyThreads),
      // …the rest of the existing options unchanged
    }),
```

and the same shape for `forProvider(providerId, type?)` with key `["messaging", "threads", "provider", providerId, type ?? "all"]`. Import `ThreadType` from the domain.

- [ ] **Step 5: Pass the filter through the viewmodels**

`use-threads.ts`: `export function useThreads(type?: ThreadType)`, `useInfiniteQuery(messagingQueries.mine(type))`, and **delete the `?? ""` degrade** — the mapping becomes `query.data?.pages.flatMap((page) => page.items) ?? []` (the DTO is now exactly the domain shape). Same in `use-provider-threads.ts`: `useProviderThreads(providerId: string, type?: ThreadType)`.

- [ ] **Step 6: Label the platform in a conversation**

In `ui/thread-view.tsx`, add `platformLabel` to the props (`/** The name a `platform` message is captioned with — "Suporte Ntizo". Undefined on an inquiry, where no message is ever from the platform. */`), pass it into `MessageBubble`, and inside the bubble render, above the body:

```tsx
      {message.senderSide === "platform" && platformLabel && (
        <p className="type-caption mb-1 font-semibold text-[var(--color-muted-foreground)]">
          {platformLabel}
        </p>
      )}
```

Change `mine` at the call site so a platform message is never "mine":

```tsx
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderSide !== "platform" && message.senderUserId === viewerUserId}
            platformLabel={platformLabel}
            locale={locale}
          />
```

- [ ] **Step 7: Label a support row in the list**

In `ui/thread-list.tsx`, inside `ThreadRow`, replace the name line's value with a branch on `thread.support`: when it is non-null the row's primary line is `thread.support.subject`, its secondary label is `t("platformSender", { ns: "help" })`… — but `thread-list.tsx` translates in the `messaging` namespace, so **add the two keys to `messaging.json` instead** (all eight locales): `"supportSender": "Suporte Ntizo"` and `"supportStatus": { "open": "Aberto", "resolved": "Resolvido" }` (en-US: `"Ntizo Support"`, `"Open"`, `"Resolved"`; translate the rest).

Render, in the row's title area:

```tsx
        {thread.support ? (
          <>
            <span className="type-body-medium truncate">{thread.support.subject}</span>
            <span className="type-caption text-[var(--color-muted-foreground)]">
              {t("supportSender")}
            </span>
            <Badge tone={thread.support.status === "open" ? "info" : "neutral"}>
              {t(`supportStatus.${thread.support.status}`)}
            </Badge>
          </>
        ) : (
          <span className="type-body-medium truncate">{resolvedNameOf(thread) || fallback}</span>
        )}
```

Keep the existing classes and the unread badge as they are; import `Badge` from `@ntizo/frontend-ui`. Adjust the JSX to the row's real structure rather than pasting this block wholesale.

- [ ] **Step 8: Make the contact check optional**

In `ui/message-composer.tsx`, add `checkContact = true` to the props with a doc line:

```
   * Whether to refuse a body carrying a phone number or an email.
   * `true` between a customer and a provider — the anti-disintermediation
   * rule the server also enforces. `false` on a support thread, where
   * giving the platform a number to call back is the point (the server
   * skips it there too — `SendMessageCommand`).
```

and change the constant: `const bodyHasContact = checkContact && hasContact(body);`.

- [ ] **Step 9: Pass the labels from the two inbox pages**

In `ui/customer-messages-page.tsx` and `ui/provider-messages-page.tsx`: the header line becomes `selectedThread?.support ? selectedThread.support.subject : (selectedThread?.providerName || t("conversationFallbackTitle"))` (the provider page keeps its `customerName` choice for inquiries), and both pass to the conversation:

```tsx
                <ThreadView
                  messages={messages}
                  viewerUserId={me?.id}
                  platformLabel={t("supportSender")}
                  loading={messagesLoading}
                  hasMore={messagesHaveMore}
                  onLoadMore={loadMoreMessages}
                />
```
```tsx
                <MessageComposer
                  onSend={(body, attachments) => send(selectedThreadId, body, attachments)}
                  sending={sending}
                  errorCode={sendErrorCode}
                  checkContact={selectedThread?.support === null || selectedThread?.support === undefined}
                />
```

- [ ] **Step 10: Run the tests**

Run: `cd apps/frontend/web && bun run typecheck && bun run test`
Expected: PASS. `use-threads`'s callers may need the new optional argument threading through; nothing else in the app reads `Thread.providerId` in a way a `null` breaks — if `tsc` says otherwise, fix the call site rather than restoring the `?? ""`.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/web/src/features/messaging apps/frontend/web/src/shared/locales
git commit -m "feat(messaging): a support conversation says who the platform is, and lets a number through"
```

---

## Task 4: The panel's state, and where it may appear

**Files:**
- Create: `apps/frontend/web/src/features/help-center/domain/help-audience.ts`
- Create: `apps/frontend/web/src/features/help-center/domain/__tests__/help-audience.test.ts`
- Create: `apps/frontend/web/src/features/help-center/viewmodel/use-help-center.ts`
- Create: `apps/frontend/web/src/features/help-center/viewmodel/__tests__/use-help-center.test.tsx`
- Modify: `apps/frontend/web/src/shared/lib/zones.ts`
- Modify: `apps/frontend/web/src/shared/lib/zones.test.ts`

**Interfaces:**
- Produces:
  - `audienceForPath(pathname: string): { audience: "customer" | "provider"; providerSlug: string | null }`
  - `showsHelpLauncher(pathname: string): boolean` (in `shared/lib/zones.ts`)
  - `HelpCenterProvider({ children })` and `useHelpCenter(): HelpCenter` where
    ```ts
    interface HelpCenter {
      open: boolean;
      screen: "home" | "faq" | "requests" | "new" | "conversation";
      query: string;                       // the FAQ search box
      selectedThreadId: string | null;
      prefill: { bookingId: string; serviceName: string } | null;
      openPanel(options?: { screen?: HelpScreen; prefill?: HelpPrefill }): void;
      close(): void;
      go(screen: HelpScreen): void;
      setQuery(value: string): void;
      openThread(threadId: string): void;
      composeNew(prefill?: HelpPrefill): void;
      back(): void;
    }
    ```

- [ ] **Step 1: Write the failing tests**

`domain/__tests__/help-audience.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { audienceForPath } from "../help-audience";

describe("audienceForPath", () => {
  it("is the provider's inside a provider workspace, and names the slug", () => {
    expect(audienceForPath("/provider/salao-x/services")).toEqual({
      audience: "provider",
      providerSlug: "salao-x",
    });
  });

  it("is personal everywhere else", () => {
    expect(audienceForPath("/")).toEqual({ audience: "customer", providerSlug: null });
    expect(audienceForPath("/messages")).toEqual({ audience: "customer", providerSlug: null });
    // The public directory of businesses is a customer page, not the zone.
    expect(audienceForPath("/providers/salao-x")).toEqual({ audience: "customer", providerSlug: null });
  });

  it("is personal on the provider zone's own picker, which names no provider", () => {
    expect(audienceForPath("/provider")).toEqual({ audience: "customer", providerSlug: null });
    expect(audienceForPath("/provider/no-provider")).toEqual({ audience: "customer", providerSlug: null });
  });
});
```

Append to `shared/lib/zones.test.ts`:

```ts
describe("showsHelpLauncher", () => {
  it("shows on the public site, the customer zone and the provider zone", () => {
    for (const path of ["/", "/services", "/providers/salao-x", "/messages", "/bookings", "/provider/salao-x/overview", "/help"]) {
      expect(showsHelpLauncher(path)).toBe(true);
    }
  });

  it("hides in the admin zone — the admin is support", () => {
    expect(showsHelpLauncher("/admin")).toBe(false);
    expect(showsHelpLauncher("/admin/support")).toBe(false);
  });

  it("hides in checkout, where the slot is on hold", () => {
    expect(showsHelpLauncher("/book/svc-1")).toBe(false);
    expect(showsHelpLauncher("/booking/b-1/confirm")).toBe(false);
  });

  it("shows on the booking details step, which is where somebody asks for help", () => {
    expect(showsHelpLauncher("/booking/b-1/details")).toBe(true);
  });
});
```

`viewmodel/__tests__/use-help-center.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { HelpCenterProvider, useHelpCenter } from "../use-help-center";

const wrapper = ({ children }: { children: ReactNode }) => (
  <HelpCenterProvider>{children}</HelpCenterProvider>
);

describe("useHelpCenter", () => {
  it("starts closed on the home screen", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    expect(result.current.open).toBe(false);
    expect(result.current.screen).toBe("home");
  });

  it("opens on a screen and remembers a prefill", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    act(() => result.current.openPanel({ screen: "new", prefill: { bookingId: "b-1", serviceName: "Corte" } }));
    expect(result.current.open).toBe(true);
    expect(result.current.screen).toBe("new");
    expect(result.current.prefill).toEqual({ bookingId: "b-1", serviceName: "Corte" });
  });

  it("opening a thread selects it and shows the conversation", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    act(() => result.current.openThread("t-1"));
    expect(result.current.screen).toBe("conversation");
    expect(result.current.selectedThreadId).toBe("t-1");
  });

  it("back goes conversation → requests → home, and no further", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    act(() => result.current.openThread("t-1"));
    act(() => result.current.back());
    expect(result.current.screen).toBe("requests");
    expect(result.current.selectedThreadId).toBeNull();
    act(() => result.current.back());
    expect(result.current.screen).toBe("home");
    act(() => result.current.back());
    expect(result.current.screen).toBe("home");
  });

  it("closing forgets the prefill and the search, and keeps the panel closed", () => {
    const { result } = renderHook(() => useHelpCenter(), { wrapper });
    act(() => result.current.composeNew({ bookingId: "b-1", serviceName: "Corte" }));
    act(() => result.current.setQuery("reembolso"));
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(result.current.prefill).toBeNull();
    expect(result.current.query).toBe("");
  });

  it("throws outside the provider rather than silently doing nothing", () => {
    expect(() => renderHook(() => useHelpCenter())).toThrow(/HelpCenterProvider/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/frontend/web && bun run test -- help-audience zones use-help-center`
Expected: FAIL — the two modules do not exist and `showsHelpLauncher` is not exported.

- [ ] **Step 3: Write `audienceForPath`**

`domain/help-audience.ts`:

```ts
export type HelpAudience = "customer" | "provider";

/**
 * Whose request the panel would open here.
 *
 * Inside a workspace (`/provider/<slug>/…`) a request is the provider's:
 * every member reads it, and the admin queue names the business. Everywhere
 * else — the public site, the customer zone, and the provider zone's own
 * picker, which names no workspace — it is the person's own.
 *
 * Segment-by-segment, never `startsWith`: `/providers/salao-x` is the public
 * directory, a customer page, and a prefix test would call it the workspace.
 */
export function audienceForPath(pathname: string): { audience: HelpAudience; providerSlug: string | null } {
  const [first, second] = pathname.split("/").filter(Boolean);
  // `no-provider` is the zone's own "you have no workspace" page, not a slug.
  if (first === "provider" && second && second !== "no-provider") {
    return { audience: "provider", providerSlug: second };
  }
  return { audience: "customer", providerSlug: null };
}
```

- [ ] **Step 4: Write `showsHelpLauncher`**

Append to `shared/lib/zones.ts`:

```ts
/**
 * Whether the Help Center's launcher belongs on this page.
 *
 * Not in `/admin`: the administrator IS support, and a button offering to
 * write to themselves is noise. Not in checkout's paying steps (`/book/*`,
 * `/booking/*/confirm`), where a slot is on hold and a floating button is
 * one more thing between a person and a payment — but yes on
 * `/booking/*/details`, which is exactly where somebody stops and asks a
 * question, and which carries its own "help with this booking" link.
 *
 * Segment-wise for the same reason `zoneOwnsChrome` is: `/providers` must
 * not be read as `/provider`.
 */
export function showsHelpLauncher(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const [first, , third] = segments;
  if (first === "admin") return false;
  if (first === "book") return false;
  if (first === "booking" && third === "confirm") return false;
  return true;
}
```

- [ ] **Step 5: Write the context**

`viewmodel/use-help-center.ts`:

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type HelpScreen = "home" | "faq" | "requests" | "new" | "conversation";

/** A booking carried into the new-request form — the panel opened from that booking's page. */
export interface HelpPrefill {
  bookingId: string;
  serviceName: string;
}

export interface HelpCenter {
  open: boolean;
  screen: HelpScreen;
  query: string;
  selectedThreadId: string | null;
  prefill: HelpPrefill | null;
  openPanel(options?: { screen?: HelpScreen; prefill?: HelpPrefill }): void;
  close(): void;
  go(screen: HelpScreen): void;
  setQuery(value: string): void;
  openThread(threadId: string): void;
  composeNew(prefill?: HelpPrefill): void;
  back(): void;
}

const Ctx = createContext<HelpCenter | null>(null);

/** Where `back` goes from each screen. `home` is the floor. */
const PARENT: Record<HelpScreen, HelpScreen> = {
  home: "home",
  faq: "home",
  requests: "home",
  new: "home",
  conversation: "requests",
};

/**
 * The panel's state, in one place, mounted once at the root.
 *
 * A context rather than state inside the panel: the launcher is not the only
 * thing that opens it — the footer's "Falar com o suporte", a booking's
 * "need help with this booking", and the `/help` page's own call to action
 * all do, from parts of the tree that render nowhere near it.
 *
 * Which audience a request belongs to is NOT held here. It is a function of
 * the current route (`audienceForPath`), and a copy in state would be a
 * second answer that goes stale the moment somebody navigates with the
 * panel open.
 */
export function HelpCenterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<HelpScreen>("home");
  const [query, setQuery] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<HelpPrefill | null>(null);

  const value = useMemo<HelpCenter>(
    () => ({
      open,
      screen,
      query,
      selectedThreadId,
      prefill,
      openPanel: (options) => {
        setScreen(options?.screen ?? "home");
        if (options?.prefill) setPrefill(options.prefill);
        setOpen(true);
      },
      close: () => {
        setOpen(false);
        // Closing forgets what this visit was about: reopening from the
        // launcher on another page must not resume somebody else's
        // half-written request about a booking they have navigated away from.
        setScreen("home");
        setQuery("");
        setSelectedThreadId(null);
        setPrefill(null);
      },
      go: (next) => setScreen(next),
      setQuery,
      openThread: (threadId) => {
        setSelectedThreadId(threadId);
        setScreen("conversation");
        setOpen(true);
      },
      composeNew: (next) => {
        setPrefill(next ?? null);
        setScreen("new");
        setOpen(true);
      },
      back: () => {
        setScreen((current) => {
          if (current === "conversation") setSelectedThreadId(null);
          return PARENT[current];
        });
      },
    }),
    [open, screen, query, selectedThreadId, prefill],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Throws outside the provider: a button that silently does nothing is worse than a crash in development. */
export function useHelpCenter(): HelpCenter {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHelpCenter must be used inside a HelpCenterProvider");
  return ctx;
}
```

Rename the file to `.tsx` (it returns JSX). Update the test's import path accordingly.

- [ ] **Step 6: Run the tests**

Run: `cd apps/frontend/web && bun run typecheck && bun run test -- help-audience zones use-help-center`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/help-center apps/frontend/web/src/shared/lib/zones.ts apps/frontend/web/src/shared/lib/zones.test.ts
git commit -m "feat(help): who a request belongs to, where the launcher belongs, and the panel's screens"
```

---

## Task 5: The panel's data layer

**Files:**
- Create: `apps/frontend/web/src/features/help-center/data/support.repository.ts`
- Create: `apps/frontend/web/src/features/help-center/data/__tests__/support.repository.test.ts`
- Create: `apps/frontend/web/src/features/help-center/viewmodel/use-support-requests.ts`
- Create: `apps/frontend/web/src/features/help-center/viewmodel/use-open-support-request.ts`
- Create: `apps/frontend/web/src/features/help-center/viewmodel/__tests__/use-open-support-request.test.tsx`

**Interfaces:**
- Consumes: Task 3's `messagingQueries.mine(type)` / `.forProvider(providerId, type)` and the `Thread` domain type; `sessionGraphql` from `@/shared/lib/graphql/session-graphql`; `messagingErrorCode` from `@/features/messaging/viewmodel/messaging-error`.
- Produces:
  - `openSupportRequest(input: OpenSupportRequestInput): Promise<string>` with `OpenSupportRequestInput { audience: "customer" | "provider"; providerId?: string; subject: string; body: string; bookingId?: string; attachments?: AttachmentDescriptor[] }`
  - `useSupportRequests(audience, providerId): { requests: Thread[]; loading: boolean; hasMore: boolean; loadMore(): void; errorCode?: string }`
  - `useOpenSupportRequest(): { openRequest(input): Promise<string | null>; opening: boolean; errorCode?: string }`

- [ ] **Step 1: Write the failing repository test**

`data/__tests__/support.repository.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { openSupportRequest } from "../support.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

describe("openSupportRequest", () => {
  it("sends only the fields it was given, and returns the thread id", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationOpenSupportRequest: { threadId: "t-1" } } as never);

    const threadId = await openSupportRequest({
      audience: "customer",
      subject: "  Reembolso  ",
      body: "  Paguei duas vezes  ",
    });

    expect(threadId).toBe("t-1");
    const [doc, vars] = spy.mock.calls[0]!;
    expect(doc).toContain("communicationOpenSupportRequest");
    // Trimmed here so the server's 1..120 bound is measured on what it will
    // store, and no `providerId`/`bookingId`/`attachments` key at all —
    // sending `undefined` makes the field present-and-null on the wire.
    expect(vars).toEqual({
      input: { audience: "customer", subject: "Reembolso", body: "Paguei duas vezes" },
    });
  });

  it("carries the provider, the booking and the attachments when there are any", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationOpenSupportRequest: { threadId: "t-2" } } as never);

    await openSupportRequest({
      audience: "provider",
      providerId: "p-1",
      subject: "Comissão",
      body: "Uma pergunta",
      bookingId: "b-1",
      attachments: [{ storageKey: "attachment/u-1/1-abc" }],
    });

    expect(spy.mock.calls[0]![1]).toEqual({
      input: {
        audience: "provider",
        providerId: "p-1",
        subject: "Comissão",
        body: "Uma pergunta",
        bookingId: "b-1",
        attachments: [{ storageKey: "attachment/u-1/1-abc" }],
      },
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/frontend/web && bun run test -- support.repository`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the repository**

`data/support.repository.ts`:

```ts
import type { AttachmentDescriptor } from "@/features/messaging/domain/types";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const OPEN_SUPPORT_REQUEST = `
  mutation CommunicationOpenSupportRequest($input: CommunicationOpenSupportRequestInput!) {
    communicationOpenSupportRequest(input: $input) { threadId }
  }`;

export interface OpenSupportRequestInput {
  audience: "customer" | "provider";
  /** Required by the server when `audience` is `provider`; it answers `SUPPORT_NOT_A_MEMBER` when it is missing or not yours. */
  providerId?: string;
  subject: string;
  body: string;
  bookingId?: string;
  attachments?: AttachmentDescriptor[];
}

/**
 * Opens a support request and hands back the thread it created.
 *
 * The optional fields are spread in only when present rather than passed as
 * `undefined`: this schema's inputs are non-null where they are declared, and
 * a key sent explicitly as `null` is a validation error rather than an
 * omission. Trimming happens here so what the 1..120 subject bound is
 * measured against is exactly what gets stored.
 *
 * Reading the requests back is `messagingQueries.mine("support")` — a
 * support request IS a thread, and a second list query over the same rows
 * would be a second answer to one question.
 */
export async function openSupportRequest(input: OpenSupportRequestInput): Promise<string> {
  const d = await sessionGraphql<{ communicationOpenSupportRequest: { threadId: string } }>(
    OPEN_SUPPORT_REQUEST,
    {
      input: {
        audience: input.audience,
        ...(input.providerId ? { providerId: input.providerId } : {}),
        subject: input.subject.trim(),
        body: input.body.trim(),
        ...(input.bookingId ? { bookingId: input.bookingId } : {}),
        ...(input.attachments && input.attachments.length > 0
          ? { attachments: input.attachments }
          : {}),
      },
    },
  );
  return d.communicationOpenSupportRequest.threadId;
}
```

- [ ] **Step 4: Write the two viewmodels**

`viewmodel/use-support-requests.ts`:

```ts
import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingQueries } from "@/features/messaging/data/messaging.repository";
import type { Thread } from "@/features/messaging/domain/types";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";
import type { HelpAudience } from "@/features/help-center/domain/help-audience";

/**
 * The requests this audience can see: the person's own, or the workspace's.
 *
 * Both are the inbox queries with `type: "support"` — plan A's
 * `listForCustomer` already keeps a provider request out of the opener's
 * personal inbox, so "mine" and "the provider's" are genuinely two lists,
 * not one filtered twice.
 *
 * A provider audience with no id yet (the workspace is still resolving)
 * asks for nothing: `enabled` is false on that query, and the panel shows
 * its loading state rather than a wrong empty list.
 */
export function useSupportRequests(audience: HelpAudience, providerId: string | null) {
  const asProvider = audience === "provider";
  const query = useInfiniteQuery(
    asProvider
      ? messagingQueries.forProvider(providerId ?? "", "support")
      : messagingQueries.mine("support"),
  );

  const requests: Thread[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    requests,
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    errorCode: messagingErrorCode(query.error),
  };
}
```

`viewmodel/use-open-support-request.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { openSupportRequest, type OpenSupportRequestInput } from "@/features/help-center/data/support.repository";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

/**
 * Opening a request, and putting the reader in front of it.
 *
 * Invalidates the whole `messaging` key rather than one list: a new request
 * belongs in the Help Center's list, in `/messages` (or the workspace's
 * inbox), and its first message is already the thread's last — three cached
 * answers, all now stale.
 *
 * Resolves the new thread id so the caller can open the conversation, or
 * `null` when the server refused — the refusal is in `errorCode`, and a
 * caller that navigated on a rejected promise would land on a thread that
 * does not exist.
 */
export function useOpenSupportRequest() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: OpenSupportRequestInput) => openSupportRequest(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["messaging"] }),
  });

  return {
    openRequest: async (input: OpenSupportRequestInput): Promise<string | null> => {
      try {
        return await mutation.mutateAsync(input);
      } catch {
        return null;
      }
    },
    opening: mutation.isPending,
    errorCode: messagingErrorCode(mutation.error),
  };
}
```

- [ ] **Step 5: Write the mutation's test**

`viewmodel/__tests__/use-open-support-request.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOpenSupportRequest } from "../use-open-support-request";

const fakes = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/features/help-center/data/support.repository", () => ({ openSupportRequest: fakes.open }));

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useOpenSupportRequest", () => {
  it("returns the new thread id and invalidates the messaging lists", async () => {
    fakes.open.mockResolvedValue("t-1");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useOpenSupportRequest(), { wrapper: wrapper(qc) });

    let id: string | null = null;
    await act(async () => {
      id = await result.current.openRequest({ audience: "customer", subject: "S", body: "B" });
    });

    expect(id).toBe("t-1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["messaging"] });
  });

  it("resolves null and reports the code when the server refuses", async () => {
    fakes.open.mockRejectedValue(Object.assign(new Error("nope"), { code: "SUPPORT_TOO_MANY_OPEN" }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { result } = renderHook(() => useOpenSupportRequest(), { wrapper: wrapper(qc) });

    let id: string | null = "unset";
    await act(async () => {
      id = await result.current.openRequest({ audience: "customer", subject: "S", body: "B" });
    });

    expect(id).toBeNull();
    await waitFor(() => expect(result.current.errorCode).toBe("SUPPORT_TOO_MANY_OPEN"));
  });
});
```

Check how `messagingErrorCode` reads a code (`viewmodel/messaging-error.ts` — it looks at `GraphqlError`'s `code`/`kitCode`) and shape the rejected error in the second test to match what that function actually reads; the assertion is that the code reaches `errorCode`, not that a bare `Error` carries it.

- [ ] **Step 6: Run the tests**

Run: `cd apps/frontend/web && bun run typecheck && bun run test -- support.repository use-open-support-request`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/help-center/data apps/frontend/web/src/features/help-center/viewmodel
git commit -m "feat(help): open a support request, and read the ones you have"
```

---

## Task 6: The panel

**Files:**
- Create: `apps/frontend/web/src/features/help-center/ui/faq-accordion.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/help-launcher.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/help-panel.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/help-home.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/help-faq.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/help-requests.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/help-new-request.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/help-conversation.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/help-center.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/__tests__/help-center.test.tsx`
- Modify: `apps/frontend/web/src/routes/__root.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 (`SheetContent` with `labelledBy`, `FAQ_CATEGORIES`/`POPULAR_QUESTION_IDS`/`searchFaq`, `useHelpCenter`, `showsHelpLauncher`, `audienceForPath`, `useSupportRequests`, `useOpenSupportRequest`), plus `useCurrentUser`, `useActiveProvider`, `useThread`, `useSendMessage`, `useMarkRead`, `ThreadView`, `MessageComposer`, `MESSAGE_BODY_MAX_LENGTH`.
- Produces: `<HelpCenter />` — the launcher and the panel, mounted once.

- [ ] **Step 1: Write the failing test**

`ui/__tests__/help-center.test.tsx`. It mounts the real `HelpCenter` inside a memory router and a `QueryClientProvider`, with the two viewmodels that hit the network mocked:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { HelpCenterProvider } from "@/features/help-center/viewmodel/use-help-center";
import { HelpCenter } from "../help-center";

const fakes = vi.hoisted(() => ({
  currentUser: vi.fn(),
  requests: vi.fn(),
  openRequest: vi.fn(),
}));

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: fakes.currentUser,
  fetchCurrentUser: vi.fn(),
}));
vi.mock("@/features/help-center/viewmodel/use-support-requests", () => ({
  useSupportRequests: fakes.requests,
}));
vi.mock("@/features/help-center/viewmodel/use-open-support-request", () => ({
  useOpenSupportRequest: () => ({ openRequest: fakes.openRequest, opening: false, errorCode: undefined }),
}));

async function renderAt(pathname: string) {
  fakes.requests.mockReturnValue({ requests: [], loading: false, hasMore: false, loadMore: vi.fn() });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      ["/", "/messages", "/sign-in", "/help", "/admin", "/book/$id"].map((path) =>
        createRoute({
          getParentRoute: () => rootRoute,
          path,
          component: () => (
            <HelpCenterProvider>
              <HelpCenter />
            </HelpCenterProvider>
          ),
        }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("HelpCenter", () => {
  it("offers the FAQ to a signed-out reader, and a way in instead of a form", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    const user = userEvent.setup();
    await renderAt("/");

    await user.click(screen.getByRole("button", { name: /help/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // A popular question is on the home screen without signing in.
    expect(screen.getByText(/when do I pay/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/subject/i)).toBeNull();
  });

  it("searches the answers as you type", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    const user = userEvent.setup();
    await renderAt("/");
    await user.click(screen.getByRole("button", { name: /help/i }));

    await user.type(screen.getByLabelText(/search help/i), "M-Pesa");

    expect(screen.getByText(/which payment methods/i)).toBeInTheDocument();
    expect(screen.queryByText(/how do I leave a review/i)).toBeNull();
  });

  it("lets a signed-in reader open a request, and shows the conversation", async () => {
    fakes.currentUser.mockReturnValue({ data: { id: "u-1", role: "customer" } });
    fakes.openRequest.mockResolvedValue("t-1");
    const user = userEvent.setup();
    await renderAt("/");

    await user.click(screen.getByRole("button", { name: /help/i }));
    await user.click(screen.getByRole("button", { name: /send a message/i }));
    await user.type(screen.getByLabelText(/subject/i), "Reembolso");
    await user.type(screen.getByLabelText(/message body/i), "Paguei duas vezes");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(fakes.openRequest).toHaveBeenCalledWith({
      audience: "customer",
      subject: "Reembolso",
      body: "Paguei duas vezes",
      attachments: [],
    });
  });

  it("is absent where it must not appear", async () => {
    fakes.currentUser.mockReturnValue({ data: null });
    await renderAt("/admin");
    expect(screen.queryByRole("button", { name: /help/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/frontend/web && bun run test -- help-center`
Expected: FAIL — `../help-center` does not exist.

- [ ] **Step 3: Write the accordion**

`ui/faq-accordion.tsx` — used by the panel and by `/help`, so it takes entries rather than reading them:

```tsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import type { FaqEntry } from "@/features/help-center/domain/faq";

/**
 * Questions that open one at a time.
 *
 * `<button aria-expanded>` over a `<details>`: the panel and `/help` both
 * need the open one to be controllable from outside (a search result opens
 * its own answer), and `details` state is the browser's, not React's.
 */
export function FaqAccordion({
  entries,
  openId,
  onToggle,
}: {
  entries: readonly FaqEntry[];
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="grid list-none gap-2 p-0">
      {entries.map((entry) => {
        const open = entry.id === openId;
        return (
          <li key={entry.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)]">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(entry.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="type-body-medium">{entry.question}</span>
              <ChevronDown
                aria-hidden="true"
                className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
              />
            </button>
            {open && (
              <p className="type-body px-4 pb-4 text-[var(--color-muted-foreground)]">{entry.answer}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

```

This file exports `FaqAccordion` and nothing else. The entries it eats are built by `useFaqEntries`, which lives in `help-faq.tsx` (Step 4) because that is where the `help` namespace is already being read.

- [ ] **Step 4: Write the screens**

`ui/help-faq.tsx` owns the entry builder and the FAQ screen:

```tsx
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { FAQ_CATEGORIES, type FaqEntry } from "@/features/help-center/domain/faq";
import { searchFaq } from "@/features/help-center/domain/faq-search";
import { FaqAccordion } from "@/features/help-center/ui/faq-accordion";

/**
 * Every question with its words resolved, in authored order.
 *
 * Built on each render rather than memoised: twenty `t()` calls is nothing,
 * and memoising on `i18n.language` would be one more thing to get wrong when
 * the language changes under an open panel.
 */
export function useFaqEntries(): FaqEntry[] {
  const { t } = useTranslation("help");
  return FAQ_CATEGORIES.flatMap((category) =>
    category.questionIds.map((id) => ({
      id,
      categoryId: category.id,
      question: t(`faq.${category.id}.${id}.q`),
      answer: t(`faq.${category.id}.${id}.a`),
    })),
  );
}

/** The panel's "all questions" screen: the categories, in order, each with its own accordion. */
export function HelpFaq({ query, onAskUs }: { query: string; onAskUs: () => void }) {
  const { t } = useTranslation("help");
  const entries = useFaqEntries();
  const [openId, setOpenId] = useState<string | null>(null);
  const matches = searchFaq(entries, query);

  if (matches.length === 0) {
    return (
      <div className="grid gap-3 p-4">
        <p className="type-body">{t("searchNoResults", { query })}</p>
        <button type="button" onClick={onAskUs} className="type-body-medium text-left text-[var(--color-primary)] hover:underline">
          {t("searchNoResultsAction")}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-4">
      {FAQ_CATEGORIES.map((category) => {
        const inCategory = matches.filter((entry) => entry.categoryId === category.id);
        if (inCategory.length === 0) return null;
        return (
          <section key={category.id} className="grid gap-2">
            <h3 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t(`faq.${category.id}.title`)}
            </h3>
            <FaqAccordion
              entries={inCategory}
              openId={openId}
              onToggle={(id) => setOpenId((current) => (current === id ? null : id))}
            />
          </section>
        );
      })}
    </div>
  );
}
```

`ui/help-home.tsx` — the search box, the two cards, the popular questions:

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { MessageSquarePlus, Inbox, Search } from "lucide-react";
import { POPULAR_QUESTION_IDS } from "@/features/help-center/domain/faq";
import { useFaqEntries, HelpFaq } from "@/features/help-center/ui/help-faq";
import { useHelpCenter } from "@/features/help-center/viewmodel/use-help-center";
import { CONTACT } from "@/shared/lib/contact";

/**
 * What the panel opens on.
 *
 * The FAQ is above the fold for everyone, signed in or not — most people
 * arrive with a question, not a case. Typing in the box replaces the rest of
 * this screen with the results, rather than navigating: a search that costs
 * a screen transition discourages the second query.
 */
export function HelpHome({ signedIn, unreadCount }: { signedIn: boolean; unreadCount: number }) {
  const { t } = useTranslation("help");
  const help = useHelpCenter();
  const entries = useFaqEntries();
  const popular = POPULAR_QUESTION_IDS.map((id) => entries.find((entry) => entry.id === id)).filter(
    (entry): entry is NonNullable<typeof entry> => entry !== undefined,
  );

  return (
    <div className="grid gap-4 p-4">
      <label className="relative block">
        <span className="sr-only">{t("searchLabel")}</span>
        <Search aria-hidden="true" className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <input
          type="search"
          value={help.query}
          onChange={(event) => help.setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="type-body w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] py-2.5 pr-3.5 pl-9 placeholder:text-[var(--color-muted-foreground)] focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
        />
      </label>

      {help.query.trim() ? (
        <HelpFaq query={help.query} onAskUs={() => help.composeNew()} />
      ) : (
        <>
          {signedIn ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => help.composeNew()} className={CARD}>
                <MessageSquarePlus aria-hidden="true" className="h-5 w-5 text-[var(--color-primary)]" />
                <span className="type-body-medium">{t("actionMessage")}</span>
                <span className="type-caption text-[var(--color-muted-foreground)]">{t("actionMessageBody")}</span>
              </button>
              <button type="button" onClick={() => help.go("requests")} className={CARD}>
                <span className="flex items-center gap-2">
                  <Inbox aria-hidden="true" className="h-5 w-5 text-[var(--color-primary)]" />
                  {unreadCount > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-primary)] px-1 text-[11px] font-semibold text-[var(--color-primary-foreground)]">
                      {unreadCount}
                    </span>
                  )}
                </span>
                <span className="type-body-medium">{t("actionRequests")}</span>
                <span className="type-caption text-[var(--color-muted-foreground)]">{t("actionRequestsBody")}</span>
              </button>
            </div>
          ) : (
            <div className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
              <p className="type-body-medium">{t("signedOutTitle")}</p>
              <p className="type-caption text-[var(--color-muted-foreground)]">
                {t("signedOutBody", { email: CONTACT.support })}
              </p>
              <Link to="/sign-in" className="type-body-medium text-[var(--color-primary)] hover:underline">
                {t("signIn")}
              </Link>
            </div>
          )}

          <section className="grid gap-2">
            <h3 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t("popularTitle")}
            </h3>
            <ul className="grid list-none gap-1.5 p-0">
              {popular.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      help.setQuery(entry.question);
                      help.go("faq");
                    }}
                    className="type-body w-full rounded-[var(--radius-card)] border border-[var(--color-border)] px-3.5 py-2.5 text-left hover:bg-[var(--color-muted)]"
                  >
                    {entry.question}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => help.go("faq")} className="type-body-medium text-[var(--color-primary)] hover:underline">
              {t("browseAll")}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

const CARD =
  "grid gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] p-3.5 text-left hover:bg-[var(--color-muted)]";
```

`ui/help-requests.tsx` — the list, reusing `ThreadList` would drag `locale`/`nameOf` plumbing in for a narrower row, so it draws its own:

```tsx
import { useTranslation } from "react-i18next";
import { Inbox } from "lucide-react";
import { Badge, Skeleton } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import type { Thread } from "@/features/messaging/domain/types";

/** The reader's own requests: subject, status, and when the last thing was said. */
export function HelpRequests({
  requests,
  loading,
  errorCode,
  locale,
  onOpen,
}: {
  requests: readonly Thread[];
  loading: boolean;
  errorCode?: string;
  locale: string;
  onOpen: (threadId: string) => void;
}) {
  const { t } = useTranslation("help");
  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  if (errorCode) return <p className="type-body p-4 text-[var(--color-destructive)]">{t("requestsError")}</p>;
  if (loading) {
    return (
      <div className="grid gap-2 p-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-[var(--radius-card)]" />
        ))}
      </div>
    );
  }
  if (requests.length === 0) {
    return <EmptyCard badge={Inbox} title={t("requestsEmptyTitle")} body={t("requestsEmptyBody")} />;
  }

  return (
    <ul className="grid list-none gap-2 p-0 p-4">
      {requests.map((request) => (
        <li key={request.id}>
          <button
            type="button"
            onClick={() => onOpen(request.id)}
            className="grid w-full gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] px-3.5 py-3 text-left hover:bg-[var(--color-muted)]"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="type-body-medium truncate">{request.support?.subject}</span>
              <Badge tone={request.support?.status === "open" ? "info" : "neutral"}>
                {t(`status.${request.support?.status ?? "open"}`)}
              </Badge>
            </span>
            <span className="type-caption flex items-center justify-between gap-2 text-[var(--color-muted-foreground)]">
              <span className="truncate">{request.lastMessagePreview}</span>
              <span className="shrink-0">{when.format(new Date(request.lastMessageAt))}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`ui/help-new-request.tsx` — subject, body, attachments, the booking chip:

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
import { MESSAGE_BODY_MAX_LENGTH, type AttachmentDescriptor } from "@/features/messaging/domain/types";
import { MessageComposer } from "@/features/messaging/ui/message-composer";
import type { HelpPrefill } from "@/features/help-center/viewmodel/use-help-center";

export const SUPPORT_SUBJECT_MAX = 120;

/**
 * The one form in the panel: a subject and a first message.
 *
 * `MessageComposer` writes the body — it already owns attachment picking and
 * upload, and a second composer would be a second place for that to be
 * wrong — with `checkContact={false}`, because this thread is with the
 * platform and a phone number is what support most often needs.
 *
 * The subject is required by the server (1..120); the button stays disabled
 * without one rather than letting a submit come back refused.
 */
export function HelpNewRequest({
  prefill,
  onClearPrefill,
  onSubmit,
  submitting,
  errorCode,
  audienceLabel,
}: {
  prefill: HelpPrefill | null;
  onClearPrefill: () => void;
  onSubmit: (subject: string, body: string, attachments: AttachmentDescriptor[]) => void;
  submitting: boolean;
  errorCode?: string;
  /** "Em nome de <provider>" when the panel was opened inside a workspace. Undefined for a personal request. */
  audienceLabel?: string;
}) {
  const { t } = useTranslation("help");
  const [subject, setSubject] = useState(prefill ? t("bookingChip", { service: prefill.serviceName }) : "");

  const trimmed = subject.trim();
  const subjectValid = trimmed.length > 0 && trimmed.length <= SUPPORT_SUBJECT_MAX;

  return (
    <div className="grid gap-3 p-4">
      {audienceLabel && <p className="type-caption text-[var(--color-muted-foreground)]">{audienceLabel}</p>}

      {prefill && (
        <span className="flex items-center gap-2">
          <Badge tone="info">{t("bookingChip", { service: prefill.serviceName })}</Badge>
          <button
            type="button"
            onClick={onClearPrefill}
            aria-label={t("bookingChipRemove")}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      )}

      <label className="grid gap-1">
        <span className="type-caption font-semibold">{t("subjectLabel")}</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder={t("subjectPlaceholder")}
          maxLength={SUPPORT_SUBJECT_MAX}
          aria-label={t("subjectLabel")}
          className="type-body w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
        />
        <span className="type-caption text-right text-[var(--color-muted-foreground)]">
          {t("subjectHint", { count: trimmed.length })}
        </span>
      </label>

      {errorCode && (
        <p className="type-body text-[var(--color-destructive)]">
          {t(`error.${errorCode}`, { defaultValue: t("error.GENERIC") })}
        </p>
      )}

      <MessageComposer
        onSend={(body, attachments) => onSubmit(trimmed, body, attachments)}
        sending={submitting}
        disabled={!subjectValid}
        checkContact={false}
      />
    </div>
  );
}
```

`ui/help-conversation.tsx`:

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@ntizo/frontend-ui";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useThread } from "@/features/messaging/viewmodel/use-thread";
import { useSendMessage } from "@/features/messaging/viewmodel/use-send-message";
import { useMarkRead } from "@/features/messaging/viewmodel/use-mark-read";
import { ThreadView } from "@/features/messaging/ui/thread-view";
import { MessageComposer } from "@/features/messaging/ui/message-composer";
import type { Thread } from "@/features/messaging/domain/types";

/**
 * One request, read and answered inside the panel.
 *
 * The same `ThreadView` and `MessageComposer` the inboxes use: a support
 * conversation is a conversation, and a second renderer for it would drift
 * from the first the day attachments or read receipts change.
 *
 * Marking read on open (and when a reply lands while it is open) is the same
 * effect `customer-messages-page.tsx` documents, for the same reason — the
 * 2-minute sweep must not email somebody about a message on their screen.
 */
export function HelpConversation({ request }: { request: Thread | null }) {
  const { t } = useTranslation("help");
  const { data: me } = useCurrentUser();
  const threadId = request?.id ?? "";
  const { messages, loading, hasMore, loadMore } = useThread(threadId);
  const { send, sending, errorCode } = useSendMessage();
  const { markRead } = useMarkRead();

  const newestInboundMessageId = messages.find((message) => message.senderUserId !== me?.id)?.id;

  useEffect(() => {
    if (threadId) markRead(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, newestInboundMessageId]);

  if (!request) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <p className="type-body-medium truncate">{request.support?.subject}</p>
        <span className="mt-1 flex items-center gap-2">
          <Badge tone={request.support?.status === "open" ? "info" : "neutral"}>
            {t(`status.${request.support?.status ?? "open"}`)}
          </Badge>
        </span>
        {request.support?.status === "resolved" && (
          <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">{t("resolvedNotice")}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ThreadView
          messages={messages}
          viewerUserId={me?.id}
          platformLabel={t("platformSender")}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </div>

      <div className="border-t border-[var(--color-border)] p-4">
        <MessageComposer
          onSend={(body, attachments) => send(threadId, body, attachments)}
          sending={sending}
          errorCode={errorCode}
          checkContact={false}
        />
      </div>
    </div>
  );
}
```

`ui/help-panel.tsx` — the shell, and `ui/help-launcher.tsx` — the button:

```tsx
// help-launcher.tsx
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";

/**
 * The floating way in.
 *
 * `bottom-20 md:bottom-6`: `MobileNav` is 56px of fixed bar at the bottom of
 * every customer page on a phone, and a launcher at `bottom-6` sits on top of
 * it. `z-30` keeps it under the open panel's own backdrop (`z-50`).
 */
export function HelpLauncher({ unreadCount, onOpen }: { unreadCount: number; onOpen: () => void }) {
  const { t } = useTranslation("help");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("launcher")}
      className="fixed right-4 bottom-20 z-30 grid h-12 w-12 place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg md:right-6 md:bottom-6"
    >
      <HelpCircle aria-hidden="true" className="h-6 w-6" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-destructive)] px-1 text-[11px] font-semibold text-white">
          {unreadCount}
        </span>
      )}
    </button>
  );
}
```

```tsx
// help-panel.tsx
import { useTranslation } from "react-i18next";
import { ChevronLeft, X } from "lucide-react";
import { Sheet, SheetContent } from "@ntizo/frontend-ui";
import type { ReactNode } from "react";

const TITLE_ID = "help-center-title";

/**
 * The panel itself: a right-hand sheet on a desktop, the same sheet full
 * width on a phone.
 *
 * `Sheet` since Task 1 is a real dialog — focus goes in, Escape closes,
 * focus comes back — so this component only decides the frame and the
 * header, not the modality.
 */
export function HelpPanel({
  open,
  onOpenChange,
  canGoBack,
  onBack,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  canGoBack: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("help");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        labelledBy={TITLE_ID}
        className="flex w-full flex-col sm:w-[26rem]"
      >
        <div className="flex items-start justify-between gap-3 bg-[var(--color-primary)] px-4 py-4 text-[var(--color-primary-foreground)]">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button type="button" onClick={onBack} aria-label={t("back")}>
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <h2 id={TITLE_ID} className="type-h3 font-semibold">
                {t("title")}
              </h2>
              <p className="type-caption opacity-90">{t("greeting")}</p>
            </div>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label={t("close")}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
```

`ui/help-center.tsx` — the one component the root mounts:

```tsx
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { audienceForPath } from "@/features/help-center/domain/help-audience";
import { useHelpCenter } from "@/features/help-center/viewmodel/use-help-center";
import { useSupportRequests } from "@/features/help-center/viewmodel/use-support-requests";
import { useOpenSupportRequest } from "@/features/help-center/viewmodel/use-open-support-request";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { showsHelpLauncher } from "@/shared/lib/zones";
import { HelpLauncher } from "@/features/help-center/ui/help-launcher";
import { HelpPanel } from "@/features/help-center/ui/help-panel";
import { HelpHome } from "@/features/help-center/ui/help-home";
import { HelpFaq } from "@/features/help-center/ui/help-faq";
import { HelpRequests } from "@/features/help-center/ui/help-requests";
import { HelpNewRequest } from "@/features/help-center/ui/help-new-request";
import { HelpConversation } from "@/features/help-center/ui/help-conversation";

/**
 * The Help Center, mounted once at the root.
 *
 * The launcher hides where `showsHelpLauncher` says so, but the panel stays
 * mounted regardless: the footer's "Falar com o suporte" and a booking's
 * "need help" both open it from pages the launcher is absent from, and a
 * panel that unmounted with its button would leave those links doing
 * nothing.
 */
export function HelpCenter() {
  const { i18n } = useTranslation("help");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const help = useHelpCenter();
  const { data: me } = useCurrentUser();
  const { activeProvider } = useActiveProvider();

  const { audience } = audienceForPath(pathname);
  const providerId = audience === "provider" ? (activeProvider?.id ?? null) : null;
  const signedIn = Boolean(me);

  const { requests, loading, errorCode, hasMore, loadMore } = useSupportRequests(audience, providerId);
  const { openRequest, opening, errorCode: openErrorCode } = useOpenSupportRequest();

  const unreadCount = signedIn
    ? requests.reduce((total, request) => total + request.unreadCount, 0)
    : 0;
  const selected = requests.find((request) => request.id === help.selectedThreadId) ?? null;

  const submit = async (subject: string, body: string, attachments: Parameters<typeof openRequest>[0]["attachments"]) => {
    const threadId = await openRequest({
      audience,
      ...(providerId ? { providerId } : {}),
      subject,
      body,
      ...(help.prefill ? { bookingId: help.prefill.bookingId } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    });
    if (threadId) help.openThread(threadId);
  };

  return (
    <>
      {showsHelpLauncher(pathname) && (
        <HelpLauncher unreadCount={unreadCount} onOpen={() => help.openPanel()} />
      )}

      <HelpPanel
        open={help.open}
        onOpenChange={(next) => (next ? help.openPanel() : help.close())}
        canGoBack={help.screen !== "home"}
        onBack={help.back}
      >
        {help.screen === "home" && <HelpHome signedIn={signedIn} unreadCount={unreadCount} />}
        {help.screen === "faq" && <HelpFaq query={help.query} onAskUs={() => help.composeNew()} />}
        {help.screen === "requests" && (
          <HelpRequests
            requests={requests}
            loading={loading}
            errorCode={errorCode}
            locale={locale}
            onOpen={help.openThread}
          />
        )}
        {help.screen === "new" && (
          <HelpNewRequest
            prefill={help.prefill}
            onClearPrefill={() => help.composeNew()}
            onSubmit={(subject, body, attachments) => void submit(subject, body, attachments)}
            submitting={opening}
            errorCode={openErrorCode}
            {...(audience === "provider" && activeProvider
              ? { audienceLabel: i18n.t("audienceProvider", { ns: "help", provider: activeProvider.name }) }
              : {})}
          />
        )}
        {help.screen === "conversation" && <HelpConversation request={selected} />}
      </HelpPanel>
    </>
  );
}
```

`hasMore`/`loadMore` are threaded into `HelpRequests` if the list grows a "load more" — the brief's component above renders one page; wire the two props through only if you add the button, otherwise drop them from the destructure so `tsc` stays quiet about unused values.

- [ ] **Step 5: Mount it at the root**

In `routes/__root.tsx`, import `HelpCenterProvider` and `HelpCenter`, and wrap what `QueryClientProvider` already renders:

```tsx
      <QueryClientProvider client={queryClient}>
        <HelpCenterProvider>
          <div className={ownChrome ? undefined : "pb-14 md:pb-0"}>
            <Outlet />
          </div>
          {!ownChrome && <MobileNav />}
          {/* Mounted for every page; it decides internally where its launcher
              may appear (`showsHelpLauncher`) and stays mounted even where it
              may not, so the footer's "talk to support" and a booking's "need
              help" can still open it. */}
          <HelpCenter />
          <Toaster position="bottom-right" richColors closeButton />
        </HelpCenterProvider>
      </QueryClientProvider>
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/frontend/web && bun run typecheck && bun run test`
Expected: PASS, including the four new `HelpCenter` tests. The whole suite matters here: `__root.tsx` is in every route test's tree.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/help-center/ui apps/frontend/web/src/routes/__root.tsx
git commit -m "feat(help): the launcher, the panel, and the five screens behind it"
```

---

## Task 7: `/help`, the footer, the strip, and the booking's way in

**Files:**
- Create: `apps/frontend/web/src/features/help-center/ui/help-page.tsx`
- Create: `apps/frontend/web/src/features/help-center/ui/__tests__/help-page.test.tsx`
- Create: `apps/frontend/web/src/routes/help.tsx`
- Modify: `apps/frontend/web/vite.config.ts`
- Modify: `apps/frontend/web/src/features/landing/ui/footer.tsx`
- Modify: `apps/frontend/web/src/features/landing/ui/__tests__/footer.test.tsx`
- Modify: `apps/frontend/web/src/features/company/ui/company-page.tsx`
- Modify: `apps/frontend/web/src/features/checkout/ui/details-page.tsx`
- Modify: `apps/frontend/web/src/shared/locales/{8}/{landing,company,checkout}.json`

**Interfaces:**
- Consumes: `useFaqEntries` and `FaqAccordion` (Task 6), `useHelpCenter` (Task 4), `FAQ_CATEGORIES` (Task 2), `CompanyPage` (`features/company/ui/company-page.tsx`), `CONTACT` (`shared/lib/contact.ts`).
- Produces: the `/help` route (prerendered), `HelpPage`, a footer that links `/help` and opens the panel, `help` in the company strip, and a "help with this booking" link on the details step.

- [ ] **Step 1: Write the failing page test**

`ui/__tests__/help-page.test.tsx`, on the `renderCompanyPage` model (copy that helper's router-and-QueryClient shape; `HelpPage` renders `CompanyPage`, which reads the session):

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHelpPage } from "./render-help-page";

describe("HelpPage", () => {
  it("lists every category and every question", async () => {
    await renderHelpPage();

    expect(screen.getByRole("heading", { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /providers/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /payments and safety/i })).toBeInTheDocument();
    // Twenty questions, each its own toggle.
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(20);
  });

  it("opens an answer when its question is clicked", async () => {
    const user = userEvent.setup();
    await renderHelpPage();

    await user.click(screen.getByRole("button", { name: /when do I pay/i }));
    expect(screen.getByText(/after the provider confirms the time/i)).toBeInTheDocument();
  });

  it("carries a heading with an anchor per category so a link can point at one", async () => {
    await renderHelpPage();
    expect(document.getElementById("customers")).not.toBeNull();
    expect(document.getElementById("providers")).not.toBeNull();
    expect(document.getElementById("payments")).not.toBeNull();
  });

  it("offers the panel at the end rather than only an email", async () => {
    await renderHelpPage();
    expect(screen.getByRole("button", { name: /talk to support/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /suporte@ntizo\.co\.mz/ })).toBeInTheDocument();
  });
});
```

Write `ui/__tests__/render-help-page.tsx` beside it, copying `features/company/ui/__tests__/render-company-page.tsx` and adding `"/help"` to its stub list, wrapping the page in `HelpCenterProvider` (the contact button calls `useHelpCenter`).

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/frontend/web && bun run test -- help-page`
Expected: FAIL — no `help-page` module.

- [ ] **Step 3: Write the page**

`ui/help-page.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CompanyPage } from "@/features/company/ui/company-page";
import { FAQ_CATEGORIES } from "@/features/help-center/domain/faq";
import { FaqAccordion } from "@/features/help-center/ui/faq-accordion";
import { useFaqEntries } from "@/features/help-center/ui/help-faq";
import { useHelpCenter } from "@/features/help-center/viewmodel/use-help-center";
import { CONTACT } from "@/shared/lib/contact";

/**
 * The FAQ, on a page anyone can link to and a crawler can read.
 *
 * The same twenty answers the panel shows, from the same `help` namespace —
 * one FAQ, two surfaces. It wears `CompanyPage`'s frame so it sits beside
 * `/about` and `/contact` rather than inventing a third page shape, and its
 * categories carry ids so `/help#payments` lands where it says.
 *
 * The panel is the primary way out at the end, not a mailto: somebody
 * reading the FAQ is already signed in more often than not, and a request
 * that arrives as a thread beats one that arrives as an email nobody can
 * reply to inside the product. The address stays as the second line, for
 * whoever cannot sign in.
 */
export function HelpPage() {
  const { t } = useTranslation("help");
  const entries = useFaqEntries();
  const help = useHelpCenter();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <CompanyPage page="help" eyebrow={t("page.eyebrow")} title={t("page.title")} lede={t("page.lede")}>
      <div className="grid gap-10">
        {FAQ_CATEGORIES.map((category) => (
          <section key={category.id} id={category.id} className="grid gap-3 scroll-mt-24">
            <h2 className="type-h3 font-semibold">{t(`faq.${category.id}.title`)}</h2>
            <FaqAccordion
              entries={entries.filter((entry) => entry.categoryId === category.id)}
              openId={openId}
              onToggle={(id) => setOpenId((current) => (current === id ? null : id))}
            />
          </section>
        ))}

        <section className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
          <h2 className="type-h3 font-semibold">{t("page.contactTitle")}</h2>
          <p className="type-body text-[var(--color-muted-foreground)]">{t("page.contactBody")}</p>
          <button
            type="button"
            onClick={() => help.composeNew()}
            className="type-body-medium justify-self-start rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-[var(--color-primary-foreground)]"
          >
            {t("page.contactAction")}
          </button>
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("page.contactEmail", { email: "" })}
            <a href={`mailto:${CONTACT.support}`} className="text-[var(--color-primary)] hover:underline">
              {CONTACT.support}
            </a>
          </p>
        </section>
      </div>
    </CompanyPage>
  );
}
```

`CompanyPage`'s `page` prop is typed `CompanyPageId` — widen that union in `features/company/ui/company-page.tsx` to include `"help"` and add `{ id: "help", to: "/help" }` to `STRIP` **ahead of `about`**, as its own comment already anticipates:

```ts
const STRIP: ReadonlyArray<{ id: CompanyPageId; to: string }> = [
  { id: "contact", to: "/contact" },
  { id: "feedback", to: "/feedback" },
  { id: "help", to: "/help" },
  { id: "about", to: "/about" },
  { id: "careers", to: "/careers" },
];
```

and add `shared.links.help.{title,body}` to `company.json` in all eight locales (pt-MZ: `"title": "Central de ajuda"`, `"body": "Perguntas frequentes, e uma forma de falar connosco."`; en-US: `"Help centre"` / `"Frequently asked questions, and a way to reach us."`; translate the rest).

The `page.contactEmail` key holds a sentence ending in the address; render it as above (prefix from i18n, address as a link) rather than interpolating markup.

- [ ] **Step 4: Add the route and prerender it**

`routes/help.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { HelpPage } from "@/features/help-center/ui/help-page";

/**
 * Top level and `ssr: true`, for the reason `/about` and `/privacy` give:
 * `_public` redirects anyone with a session away, and the signed-in read
 * this as often as anyone. Prerendered in `vite.config.ts` — the answers are
 * the same for everybody, and this is the page a search engine should find.
 */
export const Route = createFileRoute("/help")({
  ssr: true,
  head: () => ({ meta: [{ title: `${i18n.t("page.headTitle", { ns: "help" })} · Ntizo` }] }),
  component: HelpPage,
});
```

In `vite.config.ts`, extend the prerender list: `pages: [{ path: "/" }, { path: "/help" }],` with a comment saying why this one and not the other public pages (it is the FAQ; its content is identical for every visitor and worth indexing).

- [ ] **Step 5: The footer's two links**

In `features/landing/ui/footer.tsx`, replace the comment block above the Empresa column with the two links in the reference's order — Sobre, Contacto, **Falar com o suporte**, **Perguntas frequentes**, Dar feedback, Tornar-se prestador, Carreiras:

```tsx
          <FooterCol title={t("footer.company")}>
            <FooterLink to="/about">{t("footer.links.about")}</FooterLink>
            <FooterLink to="/contact">{t("footer.links.contact")}</FooterLink>
            {/* A button, not a link: support is the panel, which opens over
                whatever page the reader is on. `#132`'s "or `/help` until it
                exists" no longer applies — it exists. */}
            <button type="button" onClick={() => help.composeNew()} style={footerLink}>
              {t("footer.links.support")}
            </button>
            <FooterLink to="/help">{t("footer.links.faq")}</FooterLink>
            <FooterLink to="/feedback" search={{ from: pathname }}>{t("footer.links.feedback")}</FooterLink>
            <FooterLink to="/become-provider">{t("footer.becomeProvider")}</FooterLink>
            <FooterLink to="/careers">{t("footer.links.careers")}</FooterLink>
          </FooterCol>
```

with `const help = useHelpCenter();` at the top of `Footer`. Add `footer.links.support` and `footer.links.faq` to `landing.json` in all eight locales (pt-MZ: `"Falar com o suporte"`, `"Perguntas frequentes"`; en-US: `"Talk to support"`, `"Frequently asked questions"`).

Update `features/landing/ui/__tests__/footer.test.tsx`: the hrefs assertion becomes

```ts
    expect(hrefs).toEqual(["/about", "/contact", "/help", "/feedback?from=%2F", "/become-provider", "/careers"]);
```

(the support entry is a `button`, so it has no href), plus a new spec:

```ts
  it("opens the panel from the support link rather than navigating", async () => {
    const user = userEvent.setup();
    await renderFooter();
    await user.click(screen.getByRole("button", { name: /talk to support/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
```

`renderFooter` must now wrap in `HelpCenterProvider` and render `<HelpCenter />` beside the footer for that spec to have a panel to open; add `/help` to its stub list.

- [ ] **Step 6: The booking's way in**

In `features/checkout/ui/details-page.tsx`, inside the order-summary column, after the last `<section className={CARD}>`:

```tsx
              {booking && (
                <button
                  type="button"
                  onClick={() =>
                    help.composeNew({ bookingId: booking.id, serviceName: booking.serviceName })
                  }
                  className="type-body-medium text-left text-[var(--color-primary)] hover:underline"
                >
                  {t("helpWithBooking")}
                </button>
              )}
```

with `const help = useHelpCenter();` in the component and `checkout.json` gaining `helpWithBooking` in all eight locales (pt-MZ: `"Precisa de ajuda com esta reserva?"`; en-US: `"Need help with this booking?"`). Use whatever the file already calls its booking value; if the summary renders only when the booking has loaded, put the button inside that branch rather than guarding again.

- [ ] **Step 7: Run the gates**

Run: `cd apps/frontend/web && bun run typecheck && bun run test`
Expected: PASS, including the updated footer specs and the new page specs.

Run: `cd apps/frontend/web && bun run build`
Expected: the build prerenders `/` and `/help` — the log lists both. A prerender failure here is a real failure: it means the page reached for a session or the router at module scope.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/src/features/help-center/ui apps/frontend/web/src/routes/help.tsx apps/frontend/web/vite.config.ts apps/frontend/web/src/features/landing apps/frontend/web/src/features/company apps/frontend/web/src/features/checkout apps/frontend/web/src/shared/locales
git commit -m "feat(help): /help answers the twenty, and the footer and a booking lead to support"
```

---

## Task 8: The admin queue

**Files:**
- Create: `apps/frontend/web/src/features/admin/support/data/admin-support.repository.ts`
- Create: `apps/frontend/web/src/features/admin/support/viewmodel/use-admin-support.ts`
- Create: `apps/frontend/web/src/features/admin/support/ui/support-page.tsx`
- Create: `apps/frontend/web/src/features/admin/support/ui/__tests__/support-page.test.tsx`
- Create: `apps/frontend/web/src/routes/admin/support.tsx`
- Modify: `apps/frontend/web/src/shared/lib/admin-navigation.ts`
- Modify: `apps/frontend/web/src/shared/locales/{8}/admin.json`

**Interfaces:**
- Consumes: the four admin queries and three mutations from Global Constraints; `CollectionCard` (`shared/components/collection-card.tsx`), `usePageHeader` (`shared/lib/page-header`), `Badge`, `Button`.
- Produces:
  - `ADMIN_SUPPORT_PAGE_SIZE = 25`; `AdminSupportSearch { cursor?: string | null; status?: "open" | "resolved"; audience?: "customer" | "provider" }`
  - `adminSupportQueries.all(search)` → key `["admin","support",search]`, `adminSupportQueries.openCount()` → key `["admin","support","openCount"]`, `adminSupportQueries.one(threadId)`, `adminSupportQueries.messages(threadId)`
  - `replyToSupportRequest(threadId, body, attachments?)`, `resolveSupportRequest(threadId)`, `markSupportRequestRead(threadId)`
  - `useAdminSupport(search)`, `useSupportOpenCount()`, `useAdminSupportRequest(threadId)`, `useAdminSupportMessages(threadId)`, `useReplyToSupportRequest()`, `useResolveSupportRequest()`, `useMarkSupportRequestRead()`
  - `AdminSupportPage`

- [ ] **Step 1: Write the data layer**

`data/admin-support.repository.ts`:

```ts
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { MessagePageDTO, SupportRequestPageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import type { AttachmentDescriptor } from "@/features/messaging/domain/types";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const ALL = `
  query SupportRequests($input: SupportRequestsInput!) {
    supportRequests(input: $input) {
      items {
        threadId audience subject status requesterUserId requesterName
        providerId providerName bookingId lastMessageAt lastMessagePreview
        unreadForAdmin createdAt resolvedAt
      }
      nextCursor
    }
  }`;

const ONE = `
  query SupportRequest($input: SupportRequestInput!) {
    supportRequest(input: $input) {
      threadId audience subject status requesterUserId requesterName
      providerId providerName bookingId lastMessageAt lastMessagePreview
      unreadForAdmin createdAt resolvedAt
    }
  }`;

const MESSAGES = `
  query SupportRequestMessages($input: SupportRequestMessagesInput!) {
    supportRequestMessages(input: $input) {
      items { id threadId senderUserId senderSide body readAt createdAt attachments { id fileName contentType sizeBytes } }
      nextCursor
    }
  }`;

const OPEN_COUNT = `
  query SupportOpenCount($input: SupportOpenCountInput!) {
    supportOpenCount(input: $input) { count }
  }`;

const REPLY = `
  mutation SupportReply($input: SupportReplyInput!) {
    supportReply(input: $input) { id }
  }`;

const RESOLVE = `
  mutation SupportResolve($input: SupportResolveInput!) {
    supportResolve(input: $input) { threadId status }
  }`;

const MARK_READ = `
  mutation SupportMarkRead($input: SupportMarkReadInput!) {
    supportMarkRead(input: $input) { marked }
  }`;

export const ADMIN_SUPPORT_PAGE_SIZE = 25;
const MESSAGES_PAGE_SIZE = 30;

export interface AdminSupportSearch {
  status?: "open" | "resolved";
  audience?: "customer" | "provider";
}

export const adminSupportQueries = {
  /**
   * The queue. The whole search is the key — "resolved" is a different
   * result set from "open", not the same one filtered.
   *
   * Cursor-paged (`<ISO>|<threadId>`), unlike the contact queue's
   * offset+total: this list orders by the thread's last message, which
   * moves as people reply, and an offset into a list that reorders under
   * you shows the same row twice.
   */
  all: (search: AdminSupportSearch) =>
    infiniteQueryOptions({
      queryKey: ["admin", "support", search] as const,
      queryFn: ({ pageParam }: { pageParam: string | null }) =>
        sessionGraphql<{ supportRequests: SupportRequestPageDTO }>(ALL, {
          input: {
            limit: ADMIN_SUPPORT_PAGE_SIZE,
            cursor: pageParam,
            ...(search.status ? { status: search.status } : {}),
            ...(search.audience ? { audience: search.audience } : {}),
          },
        }).then((d) => d.supportRequests),
      initialPageParam: null as string | null,
      getNextPageParam: (last: SupportRequestPageDTO) => last.nextCursor,
    }),

  one: (threadId: string) =>
    queryOptions({
      queryKey: ["admin", "support", "one", threadId] as const,
      queryFn: () =>
        sessionGraphql<{ supportRequest: SupportRequestSummaryDTO }>(ONE, {
          input: { threadId },
        }).then((d) => d.supportRequest),
      enabled: threadId.length > 0,
    }),

  /** Polls like the participant conversation does — an admin sits on this screen while somebody replies. */
  messages: (threadId: string) =>
    infiniteQueryOptions({
      queryKey: ["admin", "support", "messages", threadId] as const,
      queryFn: ({ pageParam }: { pageParam: string | null }) =>
        sessionGraphql<{ supportRequestMessages: MessagePageDTO }>(MESSAGES, {
          input: { threadId, limit: MESSAGES_PAGE_SIZE, cursor: pageParam },
        }).then((d) => d.supportRequestMessages),
      initialPageParam: null as string | null,
      getNextPageParam: (last: MessagePageDTO) => last.nextCursor,
      enabled: threadId.length > 0,
      refetchInterval: 5_000,
    }),

  openCount: () =>
    queryOptions({
      queryKey: ["admin", "support", "openCount"] as const,
      queryFn: () =>
        sessionGraphql<{ supportOpenCount: { count: number } }>(OPEN_COUNT, { input: {} }).then(
          (d) => d.supportOpenCount.count,
        ),
    }),
};

export async function replyToSupportRequest(
  threadId: string,
  body: string,
  attachments: AttachmentDescriptor[] = [],
): Promise<string> {
  const d = await sessionGraphql<{ supportReply: { id: string } }>(REPLY, {
    input: { threadId, body: body.trim(), ...(attachments.length > 0 ? { attachments } : {}) },
  });
  return d.supportReply.id;
}

export async function resolveSupportRequest(threadId: string): Promise<void> {
  await sessionGraphql(RESOLVE, { input: { threadId } });
}

export async function markSupportRequestRead(threadId: string): Promise<number> {
  const d = await sessionGraphql<{ supportMarkRead: { marked: number } }>(MARK_READ, {
    input: { threadId },
  });
  return d.supportMarkRead.marked;
}
```

Check the emitted input type names by introspecting a running server (`SupportRequestsInput`, `SupportOpenCountInput`, …) before trusting the strings above — the field kit derives them from the schema keys, and a wrong name is a request that fails at parse time. `supportOpenCount` takes `{}`; if the emitted field takes no argument at all, drop the `$input` from that document.

`viewmodel/use-admin-support.ts`:

```ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminSupportQueries,
  markSupportRequestRead,
  replyToSupportRequest,
  resolveSupportRequest,
  type AdminSupportSearch,
} from "@/features/admin/support/data/admin-support.repository";
import type { AttachmentDescriptor } from "@/features/messaging/domain/types";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

export function useAdminSupport(search: AdminSupportSearch) {
  const query = useInfiniteQuery(adminSupportQueries.all(search));
  return {
    requests: query.data?.pages.flatMap((page) => page.items) ?? [],
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    errorCode: messagingErrorCode(query.error),
  };
}

export function useSupportOpenCount() {
  return useQuery(adminSupportQueries.openCount());
}

export function useAdminSupportRequest(threadId: string) {
  return useQuery(adminSupportQueries.one(threadId));
}

export function useAdminSupportMessages(threadId: string) {
  const query = useInfiniteQuery(adminSupportQueries.messages(threadId));
  return {
    messages: query.data?.pages.flatMap((page) => page.items) ?? [],
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
}

/** Every write invalidates the whole `["admin","support"]` key: a reply moves the row in the queue and changes the open count. */
function useSupportMutation<T>(fn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "support"] }),
  });
}

export function useReplyToSupportRequest() {
  const mutation = useSupportMutation(
    ({ threadId, body, attachments }: { threadId: string; body: string; attachments?: AttachmentDescriptor[] }) =>
      replyToSupportRequest(threadId, body, attachments ?? []),
  );
  return {
    reply: (threadId: string, body: string, attachments: AttachmentDescriptor[] = []) =>
      mutation.mutate({ threadId, body, attachments }),
    replying: mutation.isPending,
    errorCode: messagingErrorCode(mutation.error),
  };
}

export function useResolveSupportRequest() {
  const mutation = useSupportMutation((threadId: string) => resolveSupportRequest(threadId));
  return { resolve: (threadId: string) => mutation.mutate(threadId), resolving: mutation.isPending };
}

export function useMarkSupportRequestRead() {
  const mutation = useSupportMutation((threadId: string) => markSupportRequestRead(threadId));
  return { markRead: (threadId: string) => mutation.mutate(threadId) };
}
```

- [ ] **Step 2: Write the failing queue test**

`ui/__tests__/support-page.test.tsx`, on `features/admin/contact/ui/__tests__/contact-page.test.tsx`'s model (seed the query cache so no fetch happens; scope assertions to the `<table>` because `CollectionCard` renders every row twice in jsdom):

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import { AdminSupportPage } from "../support-page";

function row(over: Partial<SupportRequestSummaryDTO> = {}): SupportRequestSummaryDTO {
  return {
    threadId: "t-1", audience: "customer", subject: "Reembolso", status: "open",
    requesterUserId: "u-1", requesterName: "Ana Silva", providerId: null, providerName: "",
    bookingId: null, lastMessageAt: "2026-09-03T10:00:00.000Z", lastMessagePreview: "Paguei duas vezes",
    unreadForAdmin: 1, createdAt: "2026-09-03T09:00:00.000Z", resolvedAt: null, ...over,
  };
}

async function renderPage(items: SupportRequestSummaryDTO[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["admin", "support", { status: "open" }], {
    pages: [{ items, nextCursor: null }],
    pageParams: [null],
  });
  qc.setQueryData(["admin", "support", "openCount"], items.length);
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: AdminSupportPage }),
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/support/$threadId", component: () => <p>one</p> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/providers/$providerId", component: () => <p>provider</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return qc;
}

describe("AdminSupportPage", () => {
  it("lists an open request with who wrote it, its subject and its unread count", async () => {
    await renderPage([row()]);
    const t = within(screen.getByRole("table"));
    expect(t.getByText("Reembolso")).toBeInTheDocument();
    expect(t.getByText("Ana Silva")).toBeInTheDocument();
    expect(t.getByText("1")).toBeInTheDocument();
  });

  it("names the provider on a provider request, and links to it", async () => {
    await renderPage([row({ audience: "provider", providerId: "p-1", providerName: "Salão X", requesterName: "Bruno" })]);
    const t = within(screen.getByRole("table"));
    expect(t.getByRole("link", { name: "Salão X" })).toHaveAttribute("href", "/admin/providers/p-1");
  });

  it("links each row to the request", async () => {
    await renderPage([row()]);
    expect(within(screen.getByRole("table")).getByRole("link", { name: /Reembolso/ })).toHaveAttribute(
      "href",
      "/admin/support/t-1",
    );
  });

  it("defaults to open and lets the filter change", async () => {
    const user = userEvent.setup();
    const qc = await renderPage([row()]);
    // Switching to "resolved" is a different key, unseeded — the page must
    // ask for it rather than showing the open list under a new label.
    await user.click(screen.getByRole("button", { name: /^resolved$/i }));
    expect(qc.getQueryData(["admin", "support", { status: "resolved" }])).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd apps/frontend/web && bun run test -- support-page`
Expected: FAIL — no `support-page` module.

- [ ] **Step 4: Write the queue page**

`ui/support-page.tsx`, following `contact-page.tsx`'s structure (filter pills, `CollectionCard`, a count line), with cursor paging instead of offset:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { useAdminSupport, useSupportOpenCount } from "@/features/admin/support/viewmodel/use-admin-support";
import type { AdminSupportSearch } from "@/features/admin/support/data/admin-support.repository";

/**
 * The support queue: what people asked the platform, and what is still open.
 *
 * Open by default — the queue is worked, not browsed — the same posture
 * `/admin/contact` takes. The two queues are deliberately separate: contact
 * requests arrive from anonymous forms and are answered by email; these are
 * threads with signed-in people and are answered here.
 *
 * No search box: a request is found by its subject in a list of open ones,
 * and the backend has no search argument to offer. `CollectionCard` wants
 * `search`/`onSearchChange`, so they are passed as a controlled empty value.
 */
export function AdminSupportPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [status, setStatus] = useState<AdminSupportSearch["status"]>("open");
  const [audience, setAudience] = useState<AdminSupportSearch["audience"]>(undefined);

  const search: AdminSupportSearch = {
    ...(status ? { status } : {}),
    ...(audience ? { audience } : {}),
  };
  const { requests, loading, hasMore, loadMore, errorCode } = useAdminSupport(search);
  const openCount = useSupportOpenCount();

  usePageHeader(t("supportTitle"), t("supportSubtitle"));

  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {errorCode && <p className="type-body text-[var(--color-destructive)]">{t("supportError")}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body">{t("supportOpenCount", { count: openCount.data ?? 0 })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={status === "open" ? "default" : "outline"} size="sm" onClick={() => setStatus("open")}>
            {t("supportStatus.open")}
          </Button>
          <Button variant={status === "resolved" ? "default" : "outline"} size="sm" onClick={() => setStatus("resolved")}>
            {t("supportStatus.resolved")}
          </Button>
          <Button variant={status === undefined ? "default" : "outline"} size="sm" onClick={() => setStatus(undefined)}>
            {t("supportStatusAll")}
          </Button>
          <span className="mx-1 hidden w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
          <Button variant={audience === undefined ? "default" : "outline"} size="sm" onClick={() => setAudience(undefined)}>
            {t("supportAudienceAll")}
          </Button>
          <Button variant={audience === "customer" ? "default" : "outline"} size="sm" onClick={() => setAudience("customer")}>
            {t("supportAudience.customer")}
          </Button>
          <Button variant={audience === "provider" ? "default" : "outline"} size="sm" onClick={() => setAudience("provider")}>
            {t("supportAudience.provider")}
          </Button>
        </div>
      </div>

      <CollectionCard
        title={t("supportTitle")}
        shown={requests.length}
        total={requests.length}
        loading={loading}
        search=""
        onSearchChange={() => {}}
        searchPlaceholder=""
        columns={[
          { key: "request", label: t("supportRequest"), className: "pl-5" },
          { key: "who", label: t("supportWho"), skeletonWidth: "w-28" },
          { key: "unread", label: t("supportUnread"), align: "right", skeletonWidth: "w-10" },
          { key: "status", label: t("supportStatusColumn"), skeletonWidth: "w-20", skeletonShape: "badge" },
          { key: "last", label: t("supportLastMessage"), align: "right", className: "pr-5", skeletonWidth: "w-28" },
        ]}
        emptyText={t("supportEmpty")}
        emptyTitle={t("supportEmptyTitle")}
        emptyBadge={LifeBuoy}
        noMatchesText={t("supportEmpty")}
        noMatchesTitle={t("supportEmptyTitle")}
        filtered={status !== "open" || audience !== undefined}
        rows={requests.map((request) => ({
          key: request.threadId,
          primary: (
            <Link to="/admin/support/$threadId" params={{ threadId: request.threadId }} className="grid gap-0.5 no-underline">
              <span className="type-body-medium truncate">{request.subject}</span>
              <span className="type-caption truncate text-[var(--color-muted-foreground)]">
                {request.lastMessagePreview}
              </span>
            </Link>
          ),
          cells: {
            who:
              request.audience === "provider" && request.providerId ? (
                <Link to="/admin/providers/$providerId" params={{ providerId: request.providerId }}>
                  {request.providerName}
                </Link>
              ) : (
                <span>{request.requesterName}</span>
              ),
            unread: <span className="tabular-nums">{request.unreadForAdmin || ""}</span>,
            status: (
              <Badge tone={request.status === "open" ? "info" : "neutral"}>
                {t(`supportStatus.${request.status}`)}
              </Badge>
            ),
            last: (
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {when.format(new Date(request.lastMessageAt))}
              </span>
            ),
          },
        }))}
      />

      {hasMore && (
        <Button variant="outline" size="sm" className="justify-self-center" onClick={loadMore}>
          {t("supportLoadMore")}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Route it and put it in the sidebar**

`routes/admin/support.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportPage } from "@/features/admin/support/ui/support-page";

export const Route = createFileRoute("/admin/support")({
  component: AdminSupportPage,
});
```

In `shared/lib/admin-navigation.ts`, add `LifeBuoy` to the lucide import and the entry after `contact` (the file's own comment already says the support queue lands beside it):

```ts
      { titleKey: "nav.support", url: "/admin/support", icon: LifeBuoy },
```

Add to `admin.json` in all eight locales: `nav.support`, `supportTitle`, `supportSubtitle`, `supportOpenCount` (with `_other`), `supportError`, `supportRequest`, `supportWho`, `supportUnread`, `supportStatusColumn`, `supportLastMessage`, `supportEmpty`, `supportEmptyTitle`, `supportLoadMore`, `supportStatus.{open,resolved}`, `supportStatusAll`, `supportAudience.{customer,provider}`, `supportAudienceAll`. pt-MZ: `"nav.support": "Suporte"`, `"supportTitle": "Pedidos de suporte"`, `"supportSubtitle": "O que nos pediram, e o que ainda está por responder."`, `"supportOpenCount": "{{count}} pedido aberto"` / `"supportOpenCount_other": "{{count}} pedidos abertos"`, `"supportStatus": { "open": "Aberto", "resolved": "Resolvido" }`, `"supportAudience": { "customer": "Pessoal", "provider": "Prestador" }`, and so on.

- [ ] **Step 6: Run the tests**

Run: `cd apps/frontend/web && bun run typecheck && bun run test -- support-page i18n-parity`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/admin/support apps/frontend/web/src/routes/admin/support.tsx apps/frontend/web/src/shared/lib/admin-navigation.ts apps/frontend/web/src/shared/locales
git commit -m "feat(admin): the support queue, open first"
```

---

## Task 9: One request, in the admin zone

**Files:**
- Create: `apps/frontend/web/src/features/admin/support/ui/support-request-page.tsx`
- Create: `apps/frontend/web/src/features/admin/support/ui/__tests__/support-request-page.test.tsx`
- Create: `apps/frontend/web/src/routes/admin/support.$threadId.tsx`
- Modify: `apps/frontend/web/src/shared/locales/{8}/admin.json`

**Interfaces:**
- Consumes: Task 8's `useAdminSupportRequest`, `useAdminSupportMessages`, `useReplyToSupportRequest`, `useResolveSupportRequest`, `useMarkSupportRequestRead`; `ThreadView` and `MessageComposer` (Task 3, both presentational).
- Produces: `AdminSupportRequestPage` and the `/admin/support/$threadId` route.

- [ ] **Step 1: Write the failing test**

`ui/__tests__/support-request-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { MessageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import { AdminSupportRequestPage } from "../support-request-page";

const fakes = vi.hoisted(() => ({ reply: vi.fn(), resolve: vi.fn(), markRead: vi.fn() }));
vi.mock("@/features/admin/support/data/admin-support.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/support/data/admin-support.repository")>();
  return {
    ...actual,
    replyToSupportRequest: fakes.reply,
    resolveSupportRequest: fakes.resolve,
    markSupportRequestRead: fakes.markRead,
  };
});

const request: SupportRequestSummaryDTO = {
  threadId: "t-1", audience: "customer", subject: "Reembolso", status: "open",
  requesterUserId: "u-1", requesterName: "Ana Silva", providerId: null, providerName: "",
  bookingId: "b-1", lastMessageAt: "2026-09-03T10:00:00.000Z", lastMessagePreview: "Paguei duas vezes",
  unreadForAdmin: 1, createdAt: "2026-09-03T09:00:00.000Z", resolvedAt: null,
};

const messages: MessageDTO[] = [
  { id: "m-1", threadId: "t-1", senderUserId: "u-1", senderSide: "customer", body: "Paguei duas vezes", readAt: null, createdAt: "2026-09-03T09:00:00.000Z", attachments: [] },
];

async function renderPage(over: Partial<SupportRequestSummaryDTO> = {}) {
  fakes.reply.mockResolvedValue("m-2");
  fakes.resolve.mockResolvedValue(undefined);
  fakes.markRead.mockResolvedValue(1);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["admin", "support", "one", "t-1"], { ...request, ...over });
  qc.setQueryData(["admin", "support", "messages", "t-1"], { pages: [{ items: messages, nextCursor: null }], pageParams: [null] });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/support/$threadId", component: AdminSupportRequestPage }),
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/support", component: () => <p>queue</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/admin/support/t-1"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return qc;
}

describe("AdminSupportRequestPage", () => {
  it("shows the subject, who wrote it, the booking, and the conversation", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "Reembolso" })).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("b-1")).toBeInTheDocument();
    expect(screen.getByText("Paguei duas vezes")).toBeInTheDocument();
  });

  it("marks the request read when it opens", async () => {
    await renderPage();
    expect(fakes.markRead).toHaveBeenCalledWith("t-1");
  });

  it("sends a reply, and lets a phone number through", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText(/message body/i), "Ligue para 84 123 4567");
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    expect(fakes.reply).toHaveBeenCalledWith("t-1", "Ligue para 84 123 4567", []);
  });

  it("resolves, and says a reply reopens it", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: /mark as resolved/i }));
    expect(fakes.resolve).toHaveBeenCalledWith("t-1");
  });

  it("offers no resolve button on an already-resolved request", async () => {
    await renderPage({ status: "resolved", resolvedAt: "2026-09-03T11:00:00.000Z" });
    expect(screen.queryByRole("button", { name: /mark as resolved/i })).toBeNull();
    expect(screen.getByText(/resolved/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/frontend/web && bun run test -- support-request-page`
Expected: FAIL — no module.

- [ ] **Step 3: Write the page**

`ui/support-request-page.tsx`, on `provider-detail-page.tsx`'s layout (a back link, a header block, a `<dl>` of facts, then the conversation):

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { ThreadView } from "@/features/messaging/ui/thread-view";
import { MessageComposer } from "@/features/messaging/ui/message-composer";
import {
  useAdminSupportMessages,
  useAdminSupportRequest,
  useMarkSupportRequestRead,
  useReplyToSupportRequest,
  useResolveSupportRequest,
} from "@/features/admin/support/viewmodel/use-admin-support";

/**
 * One support request, read and answered by the platform.
 *
 * The same `ThreadView` and `MessageComposer` the participants use — with
 * `checkContact={false}`, because the platform giving out a number to call
 * back is the point, and `viewerUserId` deliberately unset: an admin's
 * bubbles align left like everyone else's here, and what names the platform
 * is `platformLabel`, not whose id matches.
 *
 * Opening the page marks it read for the platform (`supportMarkRead`), the
 * same act `/messages` performs for a participant, so the queue's unread
 * count means "nobody has looked at this".
 */
export function AdminSupportRequestPage() {
  const { t } = useTranslation("admin");
  const { threadId } = useParams({ from: "/admin/support/$threadId" });
  const { data: request, isPending } = useAdminSupportRequest(threadId);
  const { messages, loading, hasMore, loadMore } = useAdminSupportMessages(threadId);
  const { reply, replying, errorCode } = useReplyToSupportRequest();
  const { resolve, resolving } = useResolveSupportRequest();
  const { markRead } = useMarkSupportRequestRead();

  usePageHeader(request?.subject ?? t("supportTitle"), request?.requesterName);

  const newestRequesterMessageId = messages.find((message) => message.senderSide !== "platform")?.id;

  // Same shape and same reasoning as the participant pages': marking read is
  // a side effect of opening the request, and of a new message landing while
  // it is open (the 5s poll brings it). `markRead` is a fresh identity each
  // render, so it stays out of the dependency array on purpose.
  useEffect(() => {
    if (threadId) markRead(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, newestRequesterMessageId]);

  if (isPending) return <p className="type-body">…</p>;
  if (!request) return <p className="type-body text-[var(--color-destructive)]">{t("supportNotFound")}</p>;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link to="/admin/support" className="type-body-medium inline-flex items-center gap-1 text-[var(--color-muted-foreground)] no-underline">
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        {t("supportBackToQueue")}
      </Link>

      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="type-h2 font-semibold">{request.subject}</h1>
            <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
              {t(`supportAudience.${request.audience}`)}
            </p>
          </div>
          <span className="flex items-center gap-2">
            <Badge tone={request.status === "open" ? "info" : "neutral"}>
              {t(`supportStatus.${request.status}`)}
            </Badge>
            {request.status === "open" && (
              <Button size="sm" disabled={resolving} onClick={() => resolve(request.threadId)}>
                {t("supportResolve")}
              </Button>
            )}
          </span>
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-[var(--color-border)] pt-5 sm:grid-cols-2">
          <div>
            <dt className="type-caption text-[var(--color-muted-foreground)]">{t("supportWho")}</dt>
            <dd className="type-body">{request.requesterName}</dd>
          </div>
          {request.providerId && (
            <div>
              <dt className="type-caption text-[var(--color-muted-foreground)]">{t("supportProvider")}</dt>
              <dd className="type-body">
                <Link to="/admin/providers/$providerId" params={{ providerId: request.providerId }}>
                  {request.providerName}
                </Link>
              </dd>
            </div>
          )}
          {request.bookingId && (
            <div>
              <dt className="type-caption text-[var(--color-muted-foreground)]">{t("supportBooking")}</dt>
              {/* An id, not a link: there is no admin page for a booking to
                  point at. It is here so somebody can find the row. */}
              <dd className="type-body font-mono text-[13px]">{request.bookingId}</dd>
            </div>
          )}
        </dl>

        {request.status === "resolved" && (
          <p className="type-caption mt-4 text-[var(--color-muted-foreground)]">{t("supportResolvedNotice")}</p>
        )}
      </section>

      <section className="flex min-h-[24rem] flex-col rounded-[var(--radius-card)] border border-[var(--color-border)]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <ThreadView
            messages={messages}
            platformLabel={t("supportPlatformSender")}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={loadMore}
          />
        </div>
        <div className="border-t border-[var(--color-border)] p-4 sm:p-5">
          <MessageComposer
            onSend={(body, attachments) => reply(request.threadId, body, attachments)}
            sending={replying}
            errorCode={errorCode}
            checkContact={false}
          />
        </div>
      </section>
    </div>
  );
}
```

`routes/admin/support.$threadId.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportRequestPage } from "@/features/admin/support/ui/support-request-page";

export const Route = createFileRoute("/admin/support/$threadId")({
  component: AdminSupportRequestPage,
});
```

Add to `admin.json` in all eight locales: `supportBackToQueue`, `supportProvider`, `supportBooking`, `supportResolve`, `supportResolvedNotice`, `supportPlatformSender`, `supportNotFound`. pt-MZ: `"Voltar à fila"`, `"Prestador"`, `"Reserva"`, `"Marcar como resolvido"`, `"Marcado como resolvido. Se o requerente responder, o pedido reabre."`, `"Suporte Ntizo"`, `"Este pedido não existe."`; en-US: `"Back to the queue"`, `"Provider"`, `"Booking"`, `"Mark as resolved"`, `"Marked as resolved. If the requester replies, it reopens."`, `"Ntizo Support"`, `"No such request."`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/frontend/web && bun run typecheck && bun run test -- support-request-page i18n-parity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/admin/support apps/frontend/web/src/routes/admin/support.\$threadId.tsx apps/frontend/web/src/shared/locales
git commit -m "feat(admin): read a support request, answer it, and close it"
```

---

## Task 10: The four notifications say what happened

**Files:**
- Modify: `apps/frontend/web/src/features/notifications/domain/notification-presentation.ts`
- Modify: `apps/frontend/web/src/shared/locales/{8}/notifications.json`
- Create: `apps/frontend/web/src/features/notifications/domain/__tests__/notification-presentation.test.ts`

**Interfaces:**
- Consumes: the payload plan A raises — `{ threadId, subject, requestAudience, providerId? }` on all four `SUPPORT_*` types.
- Produces: `presentationFor` recognising `SUPPORT_REQUEST_OPENED`, `SUPPORT_REQUEST_MESSAGE`, `SUPPORT_REPLY`, `SUPPORT_REQUEST_RESOLVED` and `NEW_MESSAGE`.

- [ ] **Step 1: Write the failing test**

`domain/__tests__/notification-presentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { presentationFor } from "../notification-presentation";

describe("presentationFor", () => {
  it("knows the four support types and the message one", () => {
    expect(presentationFor("SUPPORT_REQUEST_OPENED").key).toBe("supportRequestOpened");
    expect(presentationFor("SUPPORT_REQUEST_MESSAGE").key).toBe("supportRequestMessage");
    expect(presentationFor("SUPPORT_REPLY").key).toBe("supportReply");
    expect(presentationFor("SUPPORT_REQUEST_RESOLVED").key).toBe("supportRequestResolved");
    expect(presentationFor("NEW_MESSAGE").key).toBe("newMessage");
  });

  it("still falls back for a type this build has never heard of", () => {
    // A deploy skew must not take the inbox down — see the module's own doc comment.
    expect(presentationFor("SOMETHING_NEW").key).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/frontend/web && bun run test -- notification-presentation`
Expected: FAIL — every support type answers `unknown`.

- [ ] **Step 3: Add the five entries**

In `notification-presentation.ts`, extend the lucide import with `LifeBuoy`, `MessageSquare`, `CheckCircle2` and add to `PRESENTATION`:

```ts
  // Messaging and support. `NEW_MESSAGE` has been raised since messaging
  // phase 1 and rendered as the generic envelope all along — it belongs in
  // this map as much as the four below.
  NEW_MESSAGE: { icon: MessageSquare, key: "newMessage" },
  SUPPORT_REQUEST_OPENED: { icon: LifeBuoy, key: "supportRequestOpened" },
  SUPPORT_REQUEST_MESSAGE: { icon: LifeBuoy, key: "supportRequestMessage" },
  SUPPORT_REPLY: { icon: LifeBuoy, key: "supportReply" },
  SUPPORT_REQUEST_RESOLVED: { icon: CheckCircle2, key: "supportRequestResolved" },
```

- [ ] **Step 4: Write the copy**

`notifications.json`'s `type` object gains five keys in all eight locales. The payload reaches `t()` through `replace`, so `{{subject}}` interpolates. pt-MZ:

```json
    "newMessage": "Tem uma mensagem nova",
    "supportRequestOpened": "Novo pedido de suporte: {{subject}}",
    "supportRequestMessage": "Nova mensagem no pedido «{{subject}}»",
    "supportReply": "O suporte respondeu ao seu pedido «{{subject}}»",
    "supportRequestResolved": "O seu pedido «{{subject}}» foi resolvido"
```

en-US: `"You have a new message"`, `"New support request: {{subject}}"`, `"New message on «{{subject}}»"`, `"Support replied to «{{subject}}»"`, `"Your request «{{subject}}» was resolved"`. Translate the other six. **The interpolation placeholders must match across locales** — the parity test compares them, not just the keys.

- [ ] **Step 5: Run the tests**

Run: `cd apps/frontend/web && bun run test -- notification-presentation i18n-parity messaging-payload-interpolation`
Expected: PASS. That third file exists because payload interpolation has bitten before — read it first; if it enumerates types, add the five there too.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/features/notifications apps/frontend/web/src/shared/locales
git commit -m "feat(notifications): a support notice says which request it is about"
```

---

## Task 11: The round trip, in a browser

**Files:**
- Create: `apps/e2e/tests/help-center.spec.ts`

**Interfaces:**
- Consumes: `createVerifiedUser(role?, name?)` and `verifyUserByEmail` (`apps/e2e/fixtures/auth.ts`), `fillSignInForm` (`fixtures/ui.ts`), `sql()` (`fixtures/db.ts`).

- [ ] **Step 1: Write the spec**

`apps/e2e/tests/help-center.spec.ts`. Model it on `tests/messaging.spec.ts` (two browser contexts, cleanup in `finally`, scoped by id) and `tests/company.spec.ts` (how it signs an admin in):

```ts
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createVerifiedUser, type VerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";
import { sql } from "../fixtures/db";

/**
 * The seam no unit test can see: a real customer opening the Help Center on
 * a real page, writing a request, and a real administrator finding it in the
 * queue, answering, and resolving it — with the customer seeing the reply
 * come back into the same panel.
 *
 * Every layer underneath is already tested in isolation (the panel's screens,
 * the queue's rows, the repositories, and plan A's whole backend). What this
 * proves is the wiring between them: the mutation is mounted, the admin
 * queries are reachable to an admin and only to an admin, and the two sides
 * are looking at the same thread.
 *
 * **Cleanup runs in `finally`, scoped by id.** Opening a request writes a
 * thread, a support_request and a message that no fixture inserted; the
 * notification rows raised for the admins are the same. Order matters:
 * notifications and their deliveries, then the thread (which cascades to
 * support_request and message), then both users in both schemas.
 */
async function signIn(page: Page, user: VerifiedUser, expectedUrl: string | RegExp): Promise<void> {
  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL(expectedUrl);
}

async function cleanup(threadId: string | null, users: readonly VerifiedUser[]): Promise<void> {
  if (threadId) {
    await sql()`DELETE FROM ntizo_notification.notification_delivery WHERE notification_id IN (
      SELECT id FROM ntizo_notification.notification WHERE payload->>'threadId' = ${threadId})`.catch(
      (err) => console.error("[e2e] help-center cleanup: deliveries", err),
    );
    await sql()`DELETE FROM ntizo_notification.notification WHERE payload->>'threadId' = ${threadId}`.catch(
      (err) => console.error("[e2e] help-center cleanup: notifications", err),
    );
    // Cascades to support_request and message.
    await sql()`DELETE FROM ntizo_communication.thread WHERE id = ${threadId}`.catch((err) =>
      console.error("[e2e] help-center cleanup: thread", err),
    );
  }
  for (const user of users) {
    await sql()`DELETE FROM ntizo_user."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] help-center cleanup: ntizo_user.user", err),
    );
    await sql()`DELETE FROM better_auth."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] help-center cleanup: better_auth.user", err),
    );
  }
}

test("a customer asks for help, and an administrator answers and closes it", async ({ browser }) => {
  const stamp = crypto.randomUUID().slice(0, 8);
  const subject = `Reembolso ${stamp}`;
  const question = `Paguei duas vezes (${stamp})`;
  const answer = `Já devolvemos o valor (${stamp})`;

  const customer = await createVerifiedUser(undefined, { firstName: "Cora", lastName: "Customer" });
  const admin = await createVerifiedUser("admin", { firstName: "Ada", lastName: "Admin" });

  let threadId: string | null = null;
  let customerCtx: BrowserContext | undefined;
  let adminCtx: BrowserContext | undefined;

  try {
    customerCtx = await browser.newContext();
    const customerPage = await customerCtx.newPage();
    await signIn(customerPage, customer, "http://localhost:3000/");

    // The launcher, on an ordinary page.
    await customerPage.getByRole("button", { name: /help/i }).click();
    await expect(customerPage.getByRole("dialog")).toBeVisible();

    await customerPage.getByRole("button", { name: /send a message/i }).click();
    await customerPage.getByLabel(/subject/i).fill(subject);
    await customerPage.getByLabel("Message body", { exact: true }).fill(question);
    await customerPage.getByRole("button", { name: /^send$/i }).click();

    // The panel switches to the conversation it just created.
    await expect(customerPage.getByRole("paragraph").filter({ hasText: question })).toBeVisible();

    const rows = await sql()`
      SELECT t.id FROM ntizo_communication.thread t
      JOIN ntizo_communication.support_request r ON r.thread_id = t.id
      WHERE r.subject = ${subject}`;
    threadId = (rows[0] as { id: string } | undefined)?.id ?? null;
    expect(threadId).not.toBeNull();

    adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, admin, /\/admin/);

    await adminPage.goto("/admin/support");
    await adminPage.getByRole("link", { name: new RegExp(subject) }).click();
    await expect(adminPage.getByRole("heading", { name: subject })).toBeVisible();
    await expect(adminPage.getByText(question)).toBeVisible();

    await adminPage.getByLabel("Message body", { exact: true }).fill(answer);
    await adminPage.getByRole("button", { name: /^send$/i }).click();
    await expect(adminPage.getByText(answer)).toBeVisible();

    await adminPage.getByRole("button", { name: /mark as resolved/i }).click();
    await expect(adminPage.getByText(/^resolved$/i)).toBeVisible();

    // Back on the customer's side: the reply is labelled as the platform's,
    // and the request now says resolved.
    await customerPage.reload();
    await customerPage.getByRole("button", { name: /help/i }).click();
    await customerPage.getByRole("button", { name: /my requests/i }).click();
    await customerPage.getByRole("button", { name: new RegExp(subject) }).click();
    await expect(customerPage.getByText(answer)).toBeVisible();
    await expect(customerPage.getByText("Ntizo Support")).toBeVisible();
  } finally {
    await cleanup(threadId, [customer, admin]);
    await customerCtx?.close();
    await adminCtx?.close();
  }
});

test("the support fields refuse a customer", async ({ page }) => {
  const customer = await createVerifiedUser(undefined, { firstName: "Cleo", lastName: "Curious" });
  try {
    await signIn(page, customer, "http://localhost:3000/");
    // The admin route redirects a non-admin away — the guard, not the field.
    await page.goto("/admin/support");
    await expect(page).not.toHaveURL(/\/admin\/support/);

    // And the field itself refuses, which is the check that matters: a
    // guard is a convenience, the resolver is the boundary.
    const refused = await page.evaluate(async () => {
      const res = await fetch("/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: "{ supportOpenCount(input: {}) { count } }" }),
      });
      return (await res.json()) as { errors?: { extensions?: { code?: string } }[] };
    });
    expect(refused.errors?.[0]?.extensions?.code).toBe("ADMIN_ONLY");
  } finally {
    await cleanup(null, [customer]);
  }
});
```

Verify the second test's expected error code against a running server before trusting it: plan A's handlers throw `ForbiddenError` with `code: "ADMIN_ONLY"`, and the kit may surface that under `extensions.code` or `extensions.originalCode` — assert on whichever the wire actually carries.

- [ ] **Step 2: Run it**

Run (needs Docker and the throwaway Postgres — see the dev-environment notes): `bun run e2e -- help-center`
Expected: both tests pass. If the launcher is not found, check `showsHelpLauncher` against the URL the customer lands on after sign-in.

- [ ] **Step 3: Prove it tests the path**

Temporarily comment out the `<HelpCenter />` mount in `routes/__root.tsx`, re-run, and confirm the first test fails at the launcher. Restore it. Say in the report that you did this and what the failure said — a green e2e that would stay green with the feature unmounted proves nothing.

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/tests/help-center.spec.ts
git commit -m "test(e2e): a customer asks, an admin answers, and both see the same thread"
```

---

## Task 12: Follow-ups, gates, and the deploy

**Files:**
- Modify: `docs/superpowers/follow-ups.md`

- [ ] **Step 1: Close what this plan closed**

In `docs/superpowers/follow-ups.md`, following the file's own convention (strike the heading, add `— RESOLVED 2026-09-03`, keep the original text below under `## <n>. (original)`):

- **#132** (the company pages' entry: the footer's two links and the strip's `help`) — resolved: `footer.links.support` opens the panel, `footer.links.faq` links `/help`, and `STRIP` carries `help` ahead of `about` with `shared.links.help` in eight locales.
- **#137** (frontend copy for the four notification types, and the two inbox fields) — resolved: `presentationFor` knows all four plus `NEW_MESSAGE`, `notifications.json` carries their sentences in eight locales, `Thread.providerId` is `string | null` and the two `?? ""` boundary lines are gone.
- **#141** (`Sheet` is not modal, and the bottom nav paints over its backdrop) — resolved for `Sheet`: focus trap, Escape, focus restore, `role="dialog"`/`aria-modal`, backdrop at `z-50` above `MobileNav`'s `z-40`. **Leave the `Dialog` half open** — this plan did not touch `Dialog`; if #141's text covers both, split the `Dialog` half into a new entry the way plan A split #71.

Find each entry's real number first (`grep -n "^## " docs/superpowers/follow-ups.md`): plan A's merge renumbered its own entries to #133–#144, so #137 and #141 above are plan A's numbering as merged. Do not guess.

- [ ] **Step 2: Open what this plan leaves**

Append new entries continuing the file's numbering, each with a `**Trigger:**` line:

1. **The FAQ answers exist in two languages, and six locales read English.** `help.json`'s `faq.*` values are copies of en-US in `es-ES`, `de-DE`, `fr-FR`, `it-IT` and `nl-NL` (pt-PT copies pt-MZ), so those readers get translated chrome and English answers. The parity test only compares keys, so nothing goes red as they diverge. **Trigger:** the first user in one of those five languages, or the same moment follow-up #120 (the app's other untranslated copy) is picked up.
2. **The panel's request list fetches on every page.** `HelpCenter` is mounted at the root and calls `useSupportRequests` unconditionally, so a signed-in reader's support list is fetched (and refetched on focus) on pages where the panel is never opened. It is one query with the messaging cache's ordinary staleness, not a poll, but it is work nobody asked for. **Trigger:** the first time the network tab is looked at on the landing page, or a query-count budget.
3. **The admin queue has no search.** `supportRequests` takes `status` and `audience` and nothing else, so a request is found by scrolling the open list. `/admin/contact` searches by reference and name. **Trigger:** the first day the open list needs more than one page.
4. **`supportOpenCount` is fetched by the queue page, not by the sidebar.** The spec wanted a badge on the nav entry; `NavItem` has no badge field and adding one touches every zone's sidebar. The count is on the queue page instead. **Trigger:** the next time somebody asks why they have to open the queue to know it has work.
5. **A resolved request cannot be reopened from the admin side.** `supportResolve` is one-way; the requester's reply reopens it (plan A). An admin who resolves the wrong request has no undo. **Trigger:** the first mis-resolve.

- [ ] **Step 3: Run the gates**

In order, pasting each summary into the commit body:

```bash
cd packages/frontend && bun run test
cd ../../apps/frontend/web && bun run typecheck && bun run test && bun run build
cd ../../.. && bun run lint --force
```

Expected: `packages/frontend` green including the new `sheet` tests; the web app green (1809 before this plan, plus this plan's) with `/` and `/help` both prerendered in the build log; lint clean. The backend suites are untouched — do not run them.

Then the e2e suite (needs Docker and the throwaway Postgres):

```bash
bun run e2e -- help-center
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/follow-ups.md
git commit -m "docs: what the help center's frontend closed, and what it left"
```

- [ ] **Step 5: Hand over**

In the final report, give the user:
- the routes now live (`/help`, `/admin/support`, `/admin/support/$threadId`) and the two footer links;
- that the deploy is manual and the order is migrate → api → web (no migration this time — plan B is frontend-only, so `cd apps/frontend/web && bun run deploy:dev` is the whole deploy, with the Node 22 PATH line);
- the five follow-ups opened above, in one line each;
- what a reviewer should look at first: the panel's audience resolution (`audienceForPath` + `useActiveProvider`), because a provider request opened from the wrong page is the one mistake with a visible consequence.

---

## Self-review against the spec

- **Frontend — Help Center** (domain/data/viewmodel/ui layout, the five screens, the launcher, signed-out behaviour, mounting) — Tasks 2, 4, 5, 6. The spec's `faq-content.ts` holding structure with text in the namespace is Task 2; its `use-help-center` shape is Task 4's context; `help-requests`/`help-new-request`/`help-conversation` are Task 6.
- **Public `/help` page** (prerendered, anchors per category, the panel as the way out) — Task 7. **The `FAQPage` JSON-LD the spec mentions is deliberately not in this plan**: the app has no structured data anywhere, `CompanyPage` owns the document head, and adding a first `ld+json` here would be a second unreviewed decision inside a page task. It is Task 12's follow-up material if the user wants it — flag it in the hand-over.
- **Entry points** (footer's two links, booking details) — Task 7.
- **Messaging inbox changes** (support rows, the platform label, the composer's prop, presentational `ThreadView`/`MessageComposer`) — Task 3; both components were already presentational, so the spec's "if they are not already" resolves to "they are".
- **Admin** (queue with tabs and audience filter, one request with reply/resolve/mark-read, nav entry, dashboard card) — Tasks 8 and 9. **The dashboard card is not built**: `features/admin/dashboard/pages/dashboard.tsx` is a stub showing the signed-in user's own row, with no card grid to add to; the open count lives on the queue page. Recorded as Task 12's follow-up 4.
- **`Sheet` becomes modal** — Task 1.
- **i18n and FAQ content** (a `help` namespace in eight locales, pt-MZ written not translated, the approved text) — Task 2, with the six-locale fallback recorded as a follow-up rather than hidden.
- **Testing** (search, screen transitions, closed panel renders nothing, signed-out sees the FAQ, `Sheet` focus/Escape, launcher absent on `/admin` and `/book`, `/help` renders with its content, the e2e round trip) — Tasks 1, 2, 4, 6, 7, 11. The spec's "renders on the server with the JSON-LD" becomes "prerenders" (Task 7 Step 7), since the JSON-LD is out.
- **Rollout** — Task 12: frontend-only, no migration, manual deploy.
