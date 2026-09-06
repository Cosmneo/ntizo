# One Console, Two Zones, One Rule — Design

**Status:** approved in brainstorming, 2026-09-06. Figures referenced below are the twelve plates
in the proposal artifact (https://claude.ai/code/artifact/23c42a28-0859-4ac4-bcaf-cc4432c49145),
which is the visual half of this document and stays the source for pixels.

**Touches** `2026-09-02-provider-bookings-and-dashboard-design.md`: that spec's Phase 1 modifies
`shared/lib/navigation.ts` and rewrites the overview page. Both land on the merged files this spec
introduces, not on the ones it deletes — see *Phasing*.

## What this is

The request: *organise the provider and admin menus to look the same, make the two consoles one
consistent application, make it easy on a phone, and make lists cards on mobile.* Clarified during
brainstorming to mean a **two-part menu inside each console** — a Work group and a Manage group —
rather than a split of the app into two products.

What comes out of it:

1. **One shell** for `/provider/$slug/*` and `/admin/*`, replacing two near-identical ones.
2. **One nav schema** — `{ home, work[], manage[] }` — that both zones fill, and that the sidebar,
   the phone's tab bar and the phone's menu sheet all render from.
3. **A mobile navigation** the consoles do not have: four tabs under the thumb, the full menu in a
   sheet above them, and a rule for who owns the bottom edge of the screen.
4. **Four patterns** every console screen is built from — page, list, detail, form — each with
   its phone rendering decided, and a fourth list state (error) that does not exist today.
5. **Twelve rules**, most of them mechanically checkable, that stop the two zones drifting again.

And one rule under all of it, because consistency is a result and not a principle:

> **What is owed comes first.** A booking request is owed an answer before its respond-by clock
> runs out. A message is owed a reply. A week of availability is owed keeping current. A draft
> service is owed publishing. Nothing is owed to a wallet balance, a member list, a category tree,
> an activity log or a settings form — those are facts you look up and occasionally change.

It decides the menu split, the phone tabs, the dashboard's first row, every list's default tab,
and the bottom edge. Each application is named where it happens.

## What exists, and what does not

Stated plainly, from reading the code on 2026-09-06.

**Written twice.**

- `shared/components/provider-shell.tsx` (171 lines) and `shared/components/admin-shell.tsx`
  (58) are the same 64px header and the same `PageHeaderContext`, twice. The admin one says so in
  its own doc comment.
- `shared/components/app-sidebar/` and `shared/components/admin-sidebar/` are the same four files
  — `app-sidebar`, `sidebar-header`, `sidebar-nav`, `sidebar-user-menu` — twice. Already drifted:
  admin's user menu calls `initialsFrom()`; provider's re-implements it inline.
- `shared/lib/navigation.ts` and `shared/lib/admin-navigation.ts` share one `NavGroup` type and
  nothing else.
- `STATUS_TONE` is declared separately in `admin/users/ui/users-page.tsx` and
  `admin/providers/ui/providers-page.tsx`.

**Visible drift.**

- Page width: `max-w-6xl` on the four admin lists and Services; `max-w-5xl` on Members;
  `max-w-4xl` on Wallet, Activity, Notifications and the admin provider detail; unset on
  Overview, Settings, Messages and the admin Dashboard.
- The provider header carries a search field with a `⌘K` badge wired to nothing, and a "New
  service" button that is the *fallback* whenever a page sets no `usePageAction` — so it renders
  on Wallet, Activity and Settings and does nothing anywhere.
- Provider's header has a bell and a commission strip; admin's has neither.
- Three screens draw their own `<h1>` — admin Dashboard, the header block in Overview, and
  Messages (`type-h1`) — while every other screen uses `usePageHeader`.
- Two mobile navigation models in one app: the customer zone has a bottom tab bar
  (`shared/components/mobile-nav.tsx`); both consoles have a hamburger that opens the sidebar as a
  `Sheet` from the left.
- `StickyActionBar` is exported from `@ntizo/frontend-ui` and used by nothing. The settings page
  has its own `SettingsSaveBar`.
- No list renders an error state. Every list page puts a red `<p>` above the card and leaves the
  card in its *empty* state underneath, so a failed fetch reads as "you have no providers yet".
- `Dialog` is centred at every width (`dialog.tsx:68`). Below `md`, with the keyboard open, a
  centred dialog is pushed off-screen.
- `SettingsNav` is `hidden lg:block` with nothing in its place below `lg`.

**Already right, and built on rather than replaced.**

- `shared/components/collection-card.tsx`: a table above `md`, one card per row below, from a
  single row *description* so the two cannot drift. Used by six lists. Not used by: Wallet
  transactions, provider Activity, admin Activity, Notifications, the Messages thread list, the
  documents block in the admin provider detail, invites in Members, and the two Bookings lists to
  come.
- Messages already routes list ⇄ thread through `?thread=` in the URL, so the browser back button
  works on a phone. That is the hard half of a two-pane inbox and it is done.
- `shared/components/wizard/wizard-chrome.tsx` is shared by onboarding and the service wizard.
- The tokens in `packages/frontend/src/styles/globals.css` are complete for both themes;
  `--color-sidebar*` is defined on both sides. Nothing here needs a new colour.
- `Button` (default) and `Input` are `h-11`. The 44px touch target already holds.
- The `workspace-status` work in the branch (`isWorkspaceLive()`, `WorkspaceStatusNotice`) is
  the right instinct in very nearly the right place — see *The strip carries zone truth*.

## Decisions taken, and why

### The menu is two groups, plus an ungrouped home row

**Work** holds what arrives and can be owed. **Manage** holds what is true. The dashboard belongs
to neither — it is the summary of both — so it sits above the groups, ungrouped, as the first
row, where Stripe, Shopify and Linear put theirs.

Both zones fill the same slots, in the same order. That is the whole of "look the same": someone
who has learned the provider console already knows admin, because *people* is always the first
row of Manage and *the queue* is always the first row of Work.

| Slot | Provider · workspace | Admin · platform |
|---|---|---|
| home | Overview | Dashboard |
| work · queue | Bookings (new) | Providers (applications) |
| work · conversation | Messages | Reviews (moderation) |
| work · schedule | Availability | — |
| work · catalogue | Services | — |
| manage · people | Members | Users |
| manage · money | Wallet | — (Payouts, later) |
| manage · record | Activity | Activity |
| manage · setup | Settings | Categories |

**Users is in Manage.** By the rule it is — a user registry is a fact you look up, not a queue
that arrives — and it makes the symmetry exact: Members is to a workspace what Users is to the
platform. Confirmed 2026-09-06. If admins turn out to work that list daily, it moves to Work and
the rule needs a sharper edge; that is a one-line change to `console-nav.ts`.

**Rejected:** ranking by frequency of use. Settings would beat Wallet, and both would beat a
booking that arrived four minutes ago. On a two-sided marketplace the measure that matters is
whether somebody is waiting on the other end.

### Two things leave the chrome

- **Notifications leaves the provider sidebar.** The header bell already links to
  `/provider/$slug/notifications`. Two controls for one destination — the argument
  `app-sidebar.tsx` already makes for removing the workspace block.
- **The dead search field and the fallback action button leave the header.** A control that lies
  about being one is worse than no control. A page with no action shows no button. Search returns
  later as a real `⌘K` palette in both zones; that is its own spec (the bookings spec says the
  same).

### One shell, parameterised by zone

`ConsoleShell zone="workspace" | "platform"`. The zone supplies three things: the nav data, the
masthead label, and whether the strip row shows workspace facts. Everything else — header height,
title and subtitle from `usePageHeader`, action slot from `usePageAction`, bell, sidebar, tab bar,
sheet, `main`'s scroll container and bottom inset — is one component.

`admin-shell.tsx` and `admin-sidebar/` are deleted, not kept as thin wrappers. A wrapper is where
the next drift starts.

### One nav schema, three renderings

```ts
// shared/lib/console-nav.ts
export type ConsoleZone = "workspace" | "platform";

export interface ConsoleNavItem {
  key: string;                 // "bookings" — stable, used in tests and analytics
  titleKey: string;            // "nav.bookings"
  shortKey?: string;           // "navShort.bookings" — the tab-bar label; see below
  url: string;                 // route template; "$slug" filled in by the shell for workspace
  icon: LucideIcon;
  primary?: true;              // one of the phone's four tabs
  count?: "bookingRequests" | "unreadThreads" | "pendingProviders" | "flaggedReviews";
}

export interface ConsoleNav {
  home: ConsoleNavItem;
  work: readonly ConsoleNavItem[];
  manage: readonly ConsoleNavItem[];
}

export function consoleNav(zone: ConsoleZone): ConsoleNav;
```

The sidebar (`ConsoleSidebar`), the phone tab bar (`ConsoleTabBar`) and the phone menu sheet
(`ConsoleMenuSheet`) all read this and nothing else. Same items, same order, same icons, same
badges. One description, three renderings — what `collection-card.tsx` already does for rows,
applied to navigation.

`count` names a *source*, not a number: the shell resolves it against the unread-count and
queue-count queries it already has in scope (the bell's `useUnreadCount`, the bookings stats
read, `communicationProviderThreads.unreadCount`). An item declares that it carries a count; it
does not fetch one.

**Rejected:** a `mobileNav` array beside the sidebar array. That is how the customer zone and the
consoles ended up with two models; a second array is the first step back there.

### On a phone: four tabs and a sheet

Below `md`, the sidebar is gone and a bottom tab bar carries the items marked `primary` — exactly
four per zone, the fourth always **Menu**, which opens the complete sidebar as a bottom sheet.

| Zone | Tab 1 | Tab 2 | Tab 3 | Tab 4 |
|---|---|---|---|---|
| Provider | Bookings (count) | Messages (count) | Calendar | Menu |
| Admin | Providers (count) | Reviews (count) | Users | Menu |

The rule picks tabs 1 and 2: the items that carry a count. Tab 3 is the remaining Work item a
phone is genuinely good for. **Calendar, not Overview, for the provider** — confirmed
2026-09-06: a provider opening the app on a phone is answering a request or checking today, not
reading KPI tiles. Overview stays first in the sheet and is where the logo goes. Editing a service
is a seven-step wizard with image cropping; a desk job, and it lives in the sheet.

The sheet *is* the sidebar: same groups, same order, the workspace switcher at its head, the
account actions at its foot. It reuses `Sheet` from the UI package — the drawer that already
exists, changed from the left edge to the bottom and given the full nav instead of a copy of it.
It closes on backdrop tap, on `Escape`, and on navigating; it traps focus while open.

**Tab labels are their own translation keys** (`navShort.*`). German's *Verfügbarkeit* and
Dutch's *Beschikbaarheid* do not fit a 97px tab at 10px; a truncated sidebar label is not a
label. Eight locale files gain a `navShort` block of at most six short strings each.

**Rejected:**

- *Keep the hamburger drawer.* Top-left is the least reachable point on a 6.1″ phone held
  right-handed; every section change is two taps and a diagonal; and it leaves the app with two
  mobile models, since the customer zone already has a bottom bar.
- *A five-slot bar and no sheet.* The provider console has nine destinations plus a workspace
  switcher. Five slots cannot hold that; the fifth becomes a junk drawer with no room for the
  account.

### Two breakpoints, and the chrome moves with the content

`md` (768px) and `lg` (1024px), both already in the codebase. Below `md`: tab bar, cards, pinned
form strip. `md`–`lg`: sidebar collapsed to its icon rail by default, table showing minus its
`priority: "wide"` columns, form rail still a strip. `lg` and up: sidebar expanded, full table,
anchor rail, detail rail.

Tying the chrome to the lines `collection-card.tsx` and `settings-nav.tsx` already switch at
means navigation and content change together, instead of a phone-shaped sidebar beside a
desktop-shaped table at 800px. Console *chrome* introduces no third line. Form fields keep their
existing `sm` split for paired inputs — that is a content decision about two fields, not a layout
decision about the page, and it stays where it is.

**The icon rail** (`Sidebar collapsible="icon"`, existing) gains three rules: group labels vanish
and a hairline divider takes their place; a badge count becomes a dot, because a two-digit number
in a 48px rail is unreadable and a wrong number is worse than none; the account row becomes the
avatar alone, with the workspace switcher entirely inside its menu.

### The bottom edge belongs to the task

A tab bar creates a collision the app has not had to answer. A dirty form wants a save bar at
the bottom; an open thread wants a composer; a booking waiting on a decision wants Accept and
Decline. Stacked on the tab bar, that is 112px of chrome on a 390px screen and two competing
primary actions.

So: **one bar, and the task wins.** The tab bar is the resting state and stands down whenever the
screen has something specific to finish —

| State | Owns the bottom edge |
|---|---|
| at rest | the tab bar |
| a form with unsaved changes | the save bar (`StickyActionBar`) |
| an open message thread | the composer |
| a detail page with a pending decision | the action bar (`StickyActionBar`, two actions) |

Never two. Where the tab bar is displaced, the way out is the screen's own back control in the
header, and where there is unsaved work that control asks before discarding it. This is the rule
in *What this is*, pointed at 56 pixels.

### Lists: adopt the existing card, and give it what a queue needs

Every console list is a `CollectionCard`. The nine screens that draw their own rows adopt it. The
component gains, in this order of need:

1. `row.to` — the whole row (and the whole card) is the navigation target. Today only the name
   inside `primary` is a link.
2. `tabs` — a segmented control above the search, with a count per tab. Bookings needs Requests /
   Upcoming / Past; the admin queue needs Pending / Active / Suspended. *The queue tab is the
   default* — the rule, applied to a list.
3. `row.tone` — drives a 3px status stripe on the leading edge of the mobile card, so state
   reads before a word does. Fed by one shared `statusTone()` in `shared/domain/status-tone.ts`,
   replacing the two `STATUS_TONE` copies.
4. `row.footer` — at most two inline actions, rendered only below `md`; on desktop they live in
   the row menu. **Ships after the booking detail page exists** (confirmed 2026-09-06), so the
   confirm-and-decline path is built once, on the detail, and the card action reuses it.
5. `error` + `onRetry` — the missing fourth state; see below.
6. `page` — a cursor and a "Load more". The bookings plan sets `MAX_PROVIDER_PAGE = 50`; no list
   pages today.
7. A sticky list header below `md`, so search, tabs and filters stay reachable while cards scroll.
8. `column.priority?: "always" | "wide"` — columns the table sheds between `md` and `lg` before it
   has to become cards. Beside `hideOnCard`, which answers the other half of the same question.

**The mobile card, in order:** status stripe · primary block (monogram, name, one line) · status
pill top-right · label/value pairs one per line · footer actions. Fig. 6.

### Four states, four renderings

Loading, empty, no-matches and error. `CollectionCard` already tells empty and no-matches apart
and is right to. The error state is new: an `EmptyCard` with `tone="danger"`, a glyph, a plain
sentence about what happened and what did not ("nothing has changed on your side"), and a *Try
again* action. It replaces the whole list body — an error never leaves an empty state visible
underneath it. Fig. 7.

### The strip carries zone truth

`provider-shell.tsx` already argues that the commission belongs in the shell and not on Overview:
*"a bookmark straight to `/services/new` or an already-open tab never passes through Overview."*
Word for word, that is the argument for `WorkspaceStatusNotice`, which the branch currently
renders on Overview only.

So the strip row under the header carries **whichever is true**: the commission for a live
workspace; for a workspace that is not live, an amber (pending) or red (suspended) sentence with
a link to what happens next, on *every* route in the zone. **It replaces the Overview notice**
(confirmed 2026-09-06); the longer explanation the notice could carry lives behind the strip's
link. Pending and suspended stay told apart, for the reason the notice's own comment gives. The
admin zone has no strip. Fig. 8.

### Detail pages: identity, body, rail — before two get built

The admin provider detail is a single column of sections. The bookings spec describes a header,
sections and a rail. Left alone, that is the sidebar duplication one layer down. One pattern,
`DetailLayout`, three parts:

1. **Identity** — back link to the list, logo or monogram, title, subtitle, status pill, and the
   decision this page is waiting for.
2. **Body** — the sections. What, when, where, for whom. Reading-width. Editable where editing
   belongs.
3. **Rail** — 300px, right, above `lg`: the money, the timeline, the technical facts. Read, never
   edited. *The rail holds no controls*; that invariant is what makes the reorder below safe.

Below `lg` the rail's *first* block moves directly under the identity and the rest of the rail
moves below the body — so the rail is ordered by what a reader asks first. For a booking that is
the money; for a provider application it is the documents' verification state. Below `md` the
decision detaches from the identity and becomes the bottom action bar. Fig. 9.

A field the projection withholds (the bookings spec's `customerPhone` until `CONFIRMED`) renders
as a first-class *revealed once confirmed* state — not an em dash, which means empty, and not a
blank, which means forgotten.

### Messages: keep the routing, fix the chrome

The `?thread=` routing stays exactly as it is. What changes: the page calls `usePageHeader` and
`ConsolePage` like every other screen; the thread list becomes a narrow single-column
`CollectionCard`; inside a thread below `md` the composer takes the bottom edge and the header
becomes the customer's name with a back chevron, because "Messages" is now behind you. Fig. 10.

### Dashboards open with what is owed

Both dashboards are the same skeleton, in this order:

1. **Needs you** — at most three cards, each a count and a destination, each rendered only when
   its count is above zero. Provider: booking requests (with the nearest respond-by), unread
   threads, rejected documents. Admin: providers awaiting review, flagged reviews, documents to
   verify. A quiet day opens straight onto the numbers, which is the honest thing to say.
2. **This month** — four tiles, not six. Six was never a considered number; it is what fits
   `xl:grid-cols-6`. A sparkline only where there is a real series (revenue), with a crosshair
   and tooltip in the build; inline SVG, no library — the bookings spec already says so.
3. **Next up** — the next two or three bookings (provider) or the latest applications (admin),
   as a `CollectionCard`.

This is the bookings spec's dashboard section, reordered by the rule. Its data model and query are
unchanged. Fig. 11.

### Forms: three patterns kept, one skeleton, the mobile hole closed

| Pattern | Mobile today | Mobile now |
|---|---|---|
| Wizard (`wizard-chrome.tsx`) | rail stacks above the form | "Step 3 of 7 · Pricing" + a progress bar, pinned under the header |
| Section form (`settings-shell.tsx`) | rail hidden, nothing replaces it | rail becomes a pinned, horizontally scrolling segmented strip, keeping the unsaved dot |
| Dialog form (`dialog.tsx`) | centred; keyboard pushes it off-screen | a bottom sheet below `md`, actions pinned above the safe area |

Field rules, all of them: label above the field; 44px controls (stop reaching for `size="sm"` in
console forms); one column below `sm`, two only above it and only for paired fields; the hint
under the field, never in the placeholder; errors under the field they belong to and a count in
the save bar; every form's bottom bar is `StickyActionBar`, into which `SettingsSaveBar` folds.
Fig. 12.

### One page width

`ConsolePage` supplies `max-w-6xl`, with `width="narrow"` as the single documented exception for
reading-width screens (a detail body, a settings form). Every ad-hoc `max-w-*` in a console page
goes. An ESLint rule keeps them gone.

## The chrome, component by component

All under `apps/frontend/web/src/shared/components/console/`.

- **`ConsoleShell`** — `{ zone, children }`. Owns `PageHeaderContext`, the sidebar (`md` up),
  the tab bar and sheet (below `md`), the header, the strip, and `main` — which is the only thing
  that scrolls, with `padding-bottom: calc(56px + env(safe-area-inset-bottom))` below `md` so the
  last card is never under the bar.
- **`ConsoleSidebar`** — renders `consoleNav(zone)`. Masthead (wordmark + zone label), home row,
  Work group, Manage group, account row with the user menu (the existing provider one, which
  already contains the admin one minus the switcher). Icon-rail rules as above.
- **`ConsoleHeader`** — title and subtitle from `usePageHeader`, the bell (both zones), the
  action slot from `usePageAction` with no fallback. No search field.
- **`ConsoleStrip`** — workspace zone only: commission, or the not-live sentence.
- **`ConsoleTabBar`** — the four `primary` items; counts resolved by the shell;
  `pb-[env(safe-area-inset-bottom)]`. Hidden while a task owns the edge.
- **`useOwnsBottomEdge()`** — a web-app hook, provided by `ConsoleShell`, that a screen calls when
  it mounts a task bar (a save bar, a composer, a decision bar); sets the flag on mount and clears
  it on unmount. `StickyActionBar` itself stays where it is, in `@ntizo/frontend-ui`, and knows
  nothing about the console — a UI-package component cannot reach a web-app context, and should
  not want to. The console wraps it once as `ConsoleActionBar`, which calls the hook.
- **`ConsoleMenuSheet`** — `Sheet` from the bottom, `max-height: 84%`; switcher, home, Work,
  Manage, account actions.
- **`ConsolePage`** — the width. `{ width?: "narrow" }`.
- **`DetailLayout`** — `{ identity, body, rail, decision? }` with the responsive reorder.

Deleted: `admin-shell.tsx`, `admin-sidebar/*`, `lib/admin-navigation.ts`, and `provider-shell.tsx`
and `app-sidebar/*` once `ConsoleShell` replaces them. `lib/navigation.ts` becomes
`lib/console-nav.ts`.

## Business rules

The twelve, each with how it is enforced.

1. One shell — `ConsoleShell`; the old files are deleted (grep in CI).
2. One nav schema — `consoleNav(zone)`; a test asserts both zones return the same group keys in
   the same order, that exactly four items per zone are `primary`, and that the fourth is Menu.
3. Two breakpoints — no `sm:`/`xl:` layout switches in console chrome (lint, `console/**`).
4. One page width — ESLint forbids `max-w-` in `features/**/ui/*.tsx` reached from console routes.
5. The shell header owns the title — no `<h1>` in a console page (lint).
6. The shell header owns the action — no fallback in `ConsoleHeader`; a page with no action
   renders no button (test).
7. The strip carries zone truth on every route — test that a not-live workspace shows the
   sentence on `/services`, not only `/overview`.
8. One bottom bar at a time — test that mounting `ConsoleActionBar` (or any caller of
   `useOwnsBottomEdge()`) hides `ConsoleTabBar`, and that unmounting restores it.
9. Every list is a `CollectionCard` — ESLint forbids `<table>` outside `collection-card.tsx`.
10. Four states — `CollectionCard` renders exactly one of loading / empty / no-matches / error
    (test for each, and that error does not also render empty).
11. Every detail is `DetailLayout`, and its rail holds no interactive element (test: no
    `button`/`a`/`input` inside `rail`).
12. One status vocabulary — `statusTone()` is the only source; the two `STATUS_TONE` constants
    are deleted.

## Explicitly out of scope

- **The `⌘K` command palette.** Its own spec; needs an index across bookings, services, members,
  customers.
- **The customer zone's chrome.** It already has a bar and a header that work.
- **Marking a booking done** — deferred by the bookings spec.
- **Bulk selection in admin lists** — desktop-only, worth waiting for a queue long enough to need
  it.
- **The wizard's step rail on desktop** — unchanged.
- **The bookings feature itself** — this spec gives it the shell, the list pattern, the detail
  pattern and the tab; the bookings spec and plan own its data and screens.

## Open questions this spec does not settle

None blocking. Two to confirm in the plan:

1. **Whether `Sheet` as it stands can open from the bottom** with a max-height and a drag handle,
   or needs a `side="bottom"` variant. Read `sheet.tsx` before Phase 2's task list.
2. **Where the tab-bar counts come from before the bookings stats read exists.** Messages' unread
   count is available today; bookings' is not until the bookings plan's Phase 1. The tab ships
   without a badge until then, and the schema's `count` field is what turns it on.

## Testing

- **`console-nav.test.ts`** — the schema assertions in rule 2; `$slug` substitution; every
  `titleKey` and `shortKey` present in all eight locale files.
- **`console-shell.test.tsx`** — zone parameterisation (masthead label, strip present only for
  workspace, nav items per zone); header title/subtitle/action from context; no fallback action;
  bottom inset on `main` below `md`; tab bar hidden while `useOwnsBottomEdge()` is held and
  restored on release. The existing `provider-shell.test.tsx` cases move here.
- **`console-tabbar` / `console-menu-sheet`** — four tabs, Menu opens the sheet, sheet lists all
  items in order, closes on backdrop / `Escape` / navigate, focus returns to the Menu tab.
- **`collection-card.test.tsx`** — extended: `row.to` makes the row and the card a link; `tabs`
  render counts and set the default; `row.tone` draws the stripe; `error` renders the danger card
  and nothing else; `page` renders "Load more" only when `hasMore`; `priority: "wide"` columns
  are absent between `md` and `lg` (via the existing container-width test helpers).
- **`detail-layout.test.tsx`** — three regions render; rail moves below body under `lg`; money
  block precedes body under `lg`; decision becomes the action bar under `md`; rail contains no
  interactive element.
- **`status-tone.test.ts`** — every `ProviderStatus`, `BookingStatus`, user status maps; unknown
  maps to `info`.
- **Lint rules** — each with a fixture that fails and one that passes.
- **Locale parity** for `navShort.*` and the new error-state strings across all eight files.
- **Mobile viewport** in the e2e harness for: tab bar present on `/provider/$slug/bookings`,
  sheet opens, a settings edit hides the tab bar and shows the save bar.

## Phasing

Five phases. **1 and 2 share one implementation plan and one release** (confirmed 2026-09-06 —
a merged console that is still hard to use on a phone is not a milestone worth shipping alone).
Phases 3, 4 and 5 each get their own plan.

1. **One shell** — `console-nav.ts`, `ConsoleShell`, `ConsoleSidebar`, `ConsoleHeader`,
   `ConsoleStrip`, `ConsolePage`; both route files; delete the duplicates; remove the search
   field, the fallback action and the Notifications sidebar item; move the workspace-status
   sentence into the strip. *No visible change on desktop beyond the removals.*
2. **The mobile menu** — `ConsoleTabBar`, `ConsoleMenuSheet`, the bottom-edge flag, `navShort`
   locale blocks, icon-rail rules, the `md`/`lg` alignment.
3. **Lists and their states** — `CollectionCard` extensions 1–3 and 5–8, `statusTone()`, the
   error `EmptyCard`, and adoption on the nine screens.
4. **Detail pages and Messages** — `DetailLayout`; the admin provider detail adopts it (the proof
   it fits both shapes); Messages' chrome; the *revealed once confirmed* field state;
   `CollectionCard` extension 4 (`row.footer`) now that the decision path exists.
5. **Dashboards, forms, last of the drift** — the two dashboards; `SettingsNav` strip; `Dialog`
   as a sheet below `md`; `SettingsSaveBar` → `StickyActionBar`; the wizard's mobile header.

The bookings plan's Phase 1 depends on this spec's Phase 1 (the nav file) and Phase 4 (the detail
layout); it should be re-sequenced to land after them.
