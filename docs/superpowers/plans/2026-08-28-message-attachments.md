# Message Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a person can send a photo or a PDF in a conversation and the other side can open it, and sharing a phone number or an email is refused — in the message body and in the file name.

**Architecture:** A private R2 bucket, downloaded through a session-authed endpoint that answers permission and existence together. An `attachment` table hanging off `message`. The message invariant changes from *has text* to *carries something*, so a photo needs no caption, which forces the message and its attachments into one transaction. Contact detection lives in `packages/shared` because the same rules must run in the browser for feedback and on the server as the gate.

**Tech Stack:** Bun, Turborepo, Hono on Cloudflare Workers, R2, Drizzle + Neon Postgres, onion-lasagna CQRS, GraphQL field kit, TanStack Query, vitest (frontend and shared) and `bun test` (backend).

**Spec:** `docs/superpowers/specs/2026-08-28-message-attachments-design.md`

**Worktree:** `/Users/saliffaustino/Desktop/Salif/Projects/Ntizo/ntizo-messaging`, branch `feat/message-attachments`. Another session works in `ntizo-workspace` on a different branch — do not touch that directory.

## Global Constraints

- Accepted types: **JPEG, PNG, WebP, PDF**. **SVG is excluded on purpose** — it is an image type that can carry script.
- **10 MB** per file, **5** attachments per message.
- The content type is decided by the server **from the leading bytes**, never taken from the client. This deliberately departs from `media.ts`, which trusts `file.type`; a `.pdf` that is really HTML, served as a PDF, is the attack this prevents.
- Downloads are served **`content-disposition: attachment`, never `inline`**, with `cache-control: private, no-store`.
- Permission and existence answer **together** — a stranger guessing ids must not learn which exist from the difference between 403 and 404. `apps/backend/api/src/documents.ts:216` is the shape.
- The contact detector lives in `packages/shared` and is imported by both the browser and the worker. Two implementations would drift.
- Detection covers **Mozambican mobile numbers** (nine digits starting with 8; 82/83 Tmcel, 84/85 Vodacom, 86/87 Movitel; with or without `+258`), **emails**, and **direct-contact links** (`wa.me`, `t.me`). General URLs are deliberately not blocked.
- Eight locales, identical key sets, valid JSON: `en-US`, `pt-MZ`, `pt-PT`, `es-ES`, `fr-FR`, `it-IT`, `de-DE`, `nl-NL`. `DEFAULT_LOCALE` is `pt-MZ`; write that copy natively.
- `packages/backend` must NOT import `hono`, `graphql-yoga`, `@cosmneo/onion-lasagna-hono`, or `@cosmneo/onion-lasagna-yoga`. The GraphQL field kit IS allowed. Four fitness tests enforce this.
- `eslint-plugin-boundaries` runs `no-unknown-files: "error"` in `apps/frontend/web`. Layers: `domain`, `data`, `viewmodel`, `ui`, `routes`, `shared`.
- `apps/frontend/web` and `packages/shared` run **vitest**; `packages/backend` and `apps/backend/api` run `bun test`. A test importing the wrong runner fails to *load* and reports "(0 test)".
- Stage by explicit path, never `git add -A`. Do not run `prettier`.
- Gates: `bun run typecheck` and the package's tests in each touched package; lint via `bun run lint --force` at the **repo root** only — inside a package eslint rejects that flag and exits 2 without linting.
- Known failure that is NOT yours: `catalog-service-search.test.ts` in `packages/backend`, data-dependent against the shared dev database.
- The dev database is shared with a deployed worker and a cron firing every minute. Any test touching it cleans up in a teardown that runs when an assertion fails partway.

---

## File Structure

**Shared — the detector**
- `packages/shared/src/text/contact-detection.ts` — the patterns and `findContacts`
- `packages/shared/src/text/index.ts` — barrel
- `packages/shared/src/index.ts` — add `export * from "./text"`

**Backend — storage and domain**
- `.../database/communication/schemas/attachment.schema.ts` — the table
- `.../communication/domain/aggregates/message.aggregate.ts` — the invariant
- `.../communication/domain/attachment.ts` — accepted types, limits, byte sniffing
- `.../communication/domain/exceptions.ts` — the new refusals
- `.../communication/app/ports/outbound/attachment.repository.port.ts`
- `.../communication/infrastructure/repositories/drizzle/attachment.repository.ts`
- `.../communication/app/use-cases/send-message.command.ts` — accepts attachments

**Worker — upload and download**
- `apps/backend/api/src/attachments.ts` — both routes
- `apps/backend/api/src/api.ts` — mount
- `apps/backend/api/src/types.ts` — `ATTACHMENTS_BUCKET`
- `apps/backend/api/wrangler.jsonc` — the bucket, per environment

**Read side**
- `packages/shared/src/read-models/system/communication/message.schema.ts` — attachments on the message
- `.../read/communication/**` — the projection carries them

**Frontend**
- `apps/frontend/web/src/features/messaging/data/attachment.repository.ts`
- `.../messaging/viewmodel/use-attachments.ts`
- `.../messaging/ui/{attachment-picker.tsx,attachment-list.tsx}`
- `.../messaging/ui/message-composer.tsx` — picker and the contact warning
- `.../messaging/ui/thread-view.tsx` — render attachments
- `shared/locales/*/messaging.json` — eight files

---

## Task 1: The contact detector

**Files:**
- Create: `packages/shared/src/text/contact-detection.ts`, `packages/shared/src/text/index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/text/__tests__/contact-detection.test.ts`

**Interfaces:**
- Produces: `findContacts(text: string): ContactMatch[]` where `ContactMatch = { kind: "phone" | "email" | "link"; value: string }`, and `hasContact(text: string): boolean`.

This runs in the browser and in the worker. It must be pure — no `process`, no `window`, no Node built-ins.

- [ ] **Step 1: Write the failing test**

`packages/shared` runs **vitest**. Import from `"vitest"`, not `"bun:test"`.

```ts
import { describe, expect, it } from "vitest";
import { findContacts, hasContact } from "../contact-detection";

describe("Mozambican mobile numbers", () => {
  it.each([
    ["841234567", "bare nine digits"],
    ["84 123 4567", "spaced the way people write them"],
    ["84-123-4567", "dashed"],
    ["+258841234567", "with the country code"],
    ["+258 84 123 4567", "country code and spaces"],
    ["821234567", "Tmcel"],
    ["871234567", "Movitel"],
  ])("catches %s (%s)", (text) => {
    expect(hasContact(`liga-me ${text}`)).toBe(true);
  });

  it.each([
    ["Rua 25 de Setembro nº 1234", "an address"],
    ["custa 8500 meticais", "a price"],
    ["são 12 fotos e 300 metros", "plain quantities"],
    ["911234567", "nine digits that do not start with 8"],
  ])("does not catch %s (%s)", (text) => {
    expect(hasContact(text)).toBe(false);
  });
});

describe("emails and direct-contact links", () => {
  it("catches an email", () => {
    expect(findContacts("escreve para ana@exemplo.co.mz")).toEqual([
      { kind: "email", value: "ana@exemplo.co.mz" },
    ]);
  });

  it("catches a wa.me link", () => {
    expect(hasContact("https://wa.me/258841234567")).toBe(true);
  });

  it("leaves an ordinary link alone — a portfolio is not a bypass", () => {
    expect(hasContact("veja o meu trabalho em exemplo.co.mz/galeria")).toBe(false);
  });
});

describe("what it reports", () => {
  it("returns every match, not just the first", () => {
    const found = findContacts("84 123 4567 ou ana@exemplo.co.mz");
    expect(found.map((m) => m.kind)).toEqual(["phone", "email"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/shared && bunx vitest run src/text`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the detector**

Match separators in plausible positions rather than stripping them. A detector that removes every space before looking for nine digits reads a price and an address as a phone number — which is what the negative cases above are there to stop.

```ts
export type ContactMatch = { kind: "phone" | "email" | "link"; value: string };

/**
 * Nine digits beginning with 8, optionally +258, tolerating one space or dash
 * between the usual groups. Anchored on a word boundary so a longer digit run —
 * an order number, a price — does not match a window inside it.
 */
const PHONE = /(?:\+258[\s-]?)?\b8[2-7][\s-]?\d{3}[\s-]?\d{4}\b/g;
const EMAIL = /\b[^\s@]+@[^\s@.]+\.[^\s@]+\b/g;
const LINK = /\b(?:wa\.me|t\.me|api\.whatsapp\.com)\/\S+/gi;

export function findContacts(text: string): ContactMatch[] {
  const found: ContactMatch[] = [];
  for (const [kind, pattern] of [
    ["link", LINK],
    ["email", EMAIL],
    ["phone", PHONE],
  ] as const) {
    for (const m of text.matchAll(pattern)) found.push({ kind, value: m[0] });
  }
  return found;
}

export function hasContact(text: string): boolean {
  return findContacts(text).length > 0;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `cd packages/shared && bunx vitest run src/text`
Expected: PASS.

Note the ordering in `findContacts`: links are matched before emails and phones, because `wa.me/258841234567` would otherwise be reported as a phone as well. Confirm the multi-match test asserts `["phone", "email"]` in the order the implementation produces, and fix the test rather than the order if it disagrees — the order is an implementation detail, the completeness is not.

- [ ] **Step 5: Prove the negatives are load-bearing**

Widen `PHONE` to `/\d{9}/g` and re-run. Expected: the address and price cases go red. Restore.

A detector with no false-negative tests will be widened by the next person until it blocks legitimate text, and nothing will notice.

- [ ] **Step 6: Export and commit**

```ts
// packages/shared/src/text/index.ts
export * from "./contact-detection";
```

Add `export * from "./text";` to `packages/shared/src/index.ts`.

Run: `cd packages/shared && bun run test && bun run typecheck`

```bash
git add packages/shared/src/text packages/shared/src/index.ts
git commit -m "feat(shared): find a phone number or an email in a piece of text"
```

---

## Task 2: The table and the invariant

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/communication/schemas/attachment.schema.ts`
- Modify: `.../communication/schemas/index.ts`
- Modify: `.../communication/domain/aggregates/message.aggregate.ts`
- Modify: `.../communication/domain/exceptions.ts`
- Test: `.../communication/__tests__/aggregates.test.ts` (extend)

**Interfaces:**
- Produces: the `attachment` table with `AttachmentRow` / `NewAttachmentRow`; `Message.compose({ threadId, senderUserId, body, attachmentCount, now })` where an empty body is allowed when `attachmentCount > 0`.

- [ ] **Step 1: Write the failing test**

```ts
it("allows an empty body when an attachment rides with it", () => {
  const m = Message.compose({ ...base, body: "", attachmentCount: 1 });
  expect(m.body).toBe("");
});

it("still refuses a message carrying nothing at all", () => {
  expect(() => Message.compose({ ...base, body: "   ", attachmentCount: 0 })).toThrow(
    MessageEmptyError,
  );
});

it("refuses more than five attachments", () => {
  expect(() => Message.compose({ ...base, body: "olá", attachmentCount: 6 })).toThrow(
    TooManyAttachmentsError,
  );
});
```

Assert the **code** the kit emits, not only the class — `toBeInstanceOf` is `instanceof`-based and stays green when a base class is swapped, which cost this branch a round already.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: FAIL.

- [ ] **Step 3: Change the invariant**

`MessageBodyEmptyError` becomes `MessageEmptyError` — the rule is no longer about text. Keep the old class name exported as well only if something outside this context imports it; check with `grep -rn "MessageBodyEmptyError" packages apps` and delete it if nothing does.

```ts
static compose(params: {
  threadId: string;
  senderUserId: string;
  body: string;
  attachmentCount: number;
  now: Date;
}): Message {
  const body = params.body.trim();
  // The rule is that a message carries something, not that it has words.
  // A photograph with no caption is a message; an empty box is not.
  if (body.length === 0 && params.attachmentCount === 0) throw new MessageEmptyError();
  if (body.length > MESSAGE_BODY_MAX) throw new MessageBodyTooLongError(body.length, MESSAGE_BODY_MAX);
  if (params.attachmentCount > MAX_ATTACHMENTS) throw new TooManyAttachmentsError(params.attachmentCount, MAX_ATTACHMENTS);
  ...
}
```

`MAX_ATTACHMENTS = 5`, exported beside `MESSAGE_BODY_MAX`.

- [ ] **Step 4: Write the table**

```ts
import { index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { communicationSchema, message } from "./message.schema";

/**
 * A file sent with a message.
 *
 * No `uploader_id`: whoever uploaded is whoever sent the message, and
 * duplicating that invites the two to disagree.
 */
export const attachment = communicationSchema.table(
  "attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_attachment_message").on(t.messageId)],
);

export type AttachmentRow = typeof attachment.$inferSelect;
export type NewAttachmentRow = typeof attachment.$inferInsert;
```

Export it from `communication/schemas/index.ts`.

- [ ] **Step 5: Generate the migration**

Run: `cd packages/backend && bun run db:ntizo:generate`
Expected: a new `00NN_*.sql` creating `ntizo_communication.attachment` with the FK and the index. `ntizo_communication` is already in `schemaFilter` — do not add it again.

Read the SQL and confirm the FK carries `ON DELETE CASCADE`. A message deleted without its attachments leaves rows pointing nowhere.

- [ ] **Step 6: Run, then prove the invariant did not simply vanish**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: PASS.

Then mutate: make `compose` accept an empty body unconditionally, ignoring `attachmentCount`. Expected: the "carrying nothing at all" test reds. Restore.

The rule changed shape rather than being removed, and that is exactly the kind of change that quietly becomes no rule at all.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/communication packages/backend/src/modules/ntizo/bounded-contexts/communication packages/backend/src/modules/ntizo/shared/infrastructure/migrations
git commit -m "feat(communication): a message carries something, not necessarily words"
```

---

## Task 3: Accepting a file, and deciding what it really is

**Files:**
- Create: `.../communication/domain/attachment.ts`
- Modify: `.../communication/domain/exceptions.ts`
- Test: `.../communication/__tests__/attachment.test.ts`

**Interfaces:**
- Produces: `MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024`; `ACCEPTED_ATTACHMENT_TYPES` as `["image/jpeg", "image/png", "image/webp", "application/pdf"]`; `sniffContentType(bytes: Uint8Array): string | null`.

No exception classes here. The upload route answers with status codes — 413, 415, 422 — the way `media.ts` already does, and a domain exception nothing throws is a parameter with no caller wearing a different hat. `ACCEPTED_ATTACHMENT_TYPES` exists for one consumer: the file picker's `accept` attribute in Task 7. If Task 7 does not use it, delete it rather than leaving it to look meaningful.

- [ ] **Step 1: Write the failing test**

```ts
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]); // RIFF....WEBP
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');

it.each([
  [JPEG, "image/jpeg"],
  [PNG, "image/png"],
  [PDF, "application/pdf"],
  [WEBP, "image/webp"],
])("recognises %#", (bytes, expected) => {
  expect(sniffContentType(bytes)).toBe(expected);
});

it("refuses HTML dressed as something else — this is the bypass", () => {
  expect(sniffContentType(HTML)).toBeNull();
});

it("refuses SVG, which is an image that can carry script", () => {
  expect(sniffContentType(SVG)).toBeNull();
});

it("does not trust a declared type over the bytes", () => {
  // The caller says PDF; the bytes say HTML. The bytes win.
  expect(sniffContentType(HTML)).not.toBe("application/pdf");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: FAIL.

- [ ] **Step 3: Write the sniffer**

```ts
/**
 * What the file actually is, from its leading bytes.
 *
 * The sender controls the content type they declare, so `media.ts`'s
 * `isImage(file.type)` decides using a value the attacker chose. Here the
 * bytes decide: an HTML file announced as a PDF and served back as a PDF is
 * script running on our origin.
 *
 * Returns null for anything not on the accepted list, SVG included — SVG is
 * an image format that can carry script, and there is no version of serving
 * one to another user that is safe enough to be worth it.
 */
export function sniffContentType(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (starts(0x52, 0x49, 0x46, 0x46) &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return "image/webp";
  return null;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: PASS.

- [ ] **Step 5: Prove the HTML case is what protects you**

Change `sniffContentType` to return the caller's declared type when the bytes do not match — the shortcut somebody will reach for when a legitimate file is rejected. Expected: the HTML and SVG tests red. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/communication
git commit -m "feat(communication): decide what a file is from its bytes, not its label"
```

---

## Task 4: Storing and reading attachments

**Files:**
- Create: `.../communication/app/ports/outbound/attachment.repository.port.ts`
- Create: `.../communication/infrastructure/repositories/drizzle/attachment.repository.ts`
- Modify: `.../communication/app/ports/outbound/index.ts`
- Modify: `.../communication/app/use-cases/send-message.command.ts`
- Test: `.../communication/__tests__/repositories.test.ts` and `commands.test.ts` (extend)

**Interfaces:**
- Consumes: `Message.compose(... attachmentCount ...)` from Task 2.
- Produces:
  - `AttachmentRepositoryPort.insertMany(messageId, attachments): Promise<void>` where each is `{ storageKey, fileName, contentType, sizeBytes }`
  - `AttachmentRepositoryPort.listForMessages(messageIds: string[]): Promise<Map<string, AttachmentRow[]>>` — **one query for a page**, never one per message
  - `AttachmentRepositoryPort.findVisible(attachmentId, viewerUserId): Promise<AttachmentRow | null>` — resolves the thread and the viewer in SQL, the same way `ThreadRepositoryPort.findVisible` does
  - `SendMessageCommand.execute({ threadId, senderUserId, body, attachments })`

- [ ] **Step 1: Write the failing test**

```ts
it("writes the message and its attachments in one transaction", async () => {
  await send.execute({ threadId, senderUserId: customerId, body: "", attachments: [one] });
  expect(uow.bothWritesInSameTransaction).toBe(true);
});

it("refuses a stranger the attachment, the same way it refuses a missing one", async () => {
  expect(await repo.findVisible(attachmentId, "someone-else")).toBeNull();
  expect(await repo.findVisible(crypto.randomUUID(), customerId)).toBeNull();
});

it("lets a member of the provider read it", async () => {
  expect(await repo.findVisible(attachmentId, staffUserId)).not.toBeNull();
});

it("lists attachments for a page of messages in one call", async () => {
  const byMessage = await repo.listForMessages([m1, m2]);
  expect(byMessage.get(m1)).toHaveLength(2);
  expect(byMessage.get(m2) ?? []).toHaveLength(0);
  expect(fake.queryCount).toBe(1);
});
```

The stranger test must use a **second real user**. A fixture holding one person's data passes whether or not the check exists — the defect this project produced five times.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: FAIL.

- [ ] **Step 3: Implement, joining through the thread**

`findVisible` joins `attachment → message → thread` and applies the same viewer rule the thread repository already uses — the customer on the thread, or a member of its provider. Put it in the query, not in the command, so a second caller cannot forget it.

- [ ] **Step 4: Extend the send command**

The command takes already-uploaded attachment descriptors and writes them beside the message inside `atomicExecute`, after the insert and before the touch.

- [ ] **Step 5: Run and watch it pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: PASS.

- [ ] **Step 6: Break each claim**

| Mutation | Must red |
|---|---|
| `findVisible` ignores `viewerUserId` | the stranger test |
| the attachment insert moves outside `atomicExecute` | the transaction test |
| `listForMessages` loops one query per message | the query-count test |

Restore from `git checkout --` after each, from the worktree root — a `cp` restore with a relative path after `cd` fails silently and leaves the mutation applied.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/communication
git commit -m "feat(communication): store a message's files, and guard who reads them"
```

---

## Task 5: Upload and download

**Files:**
- Create: `apps/backend/api/src/attachments.ts`
- Modify: `apps/backend/api/src/api.ts`, `apps/backend/api/src/types.ts`, `apps/backend/api/wrangler.jsonc`
- Test: `apps/backend/api/src/__tests__/attachments.test.ts`

**Interfaces:**
- Produces: `POST /api/communication/attachments` (multipart, returns the stored descriptor) and `GET /api/communication/attachments/:id`.

**Follow `apps/backend/api/src/documents.ts:216` for the download**, and `media.ts:124` for the multipart read (`c.req.formData()`, `file.arrayBuffer()`, `bucket.put`). **Do not follow `media.ts`'s type check** — it trusts `file.type`; use `sniffContentType` from Task 3.

- [ ] **Step 1: Write the failing test**

```ts
it("refuses a file whose bytes disagree with its declared type", async () => {
  const res = await postFile(app, htmlBytesNamed("invoice.pdf", "application/pdf"));
  expect(res.status).toBe(415);
});

it("refuses a file over ten megabytes", async () => {
  const res = await postFile(app, jpegOf(11 * 1024 * 1024));
  expect(res.status).toBe(413);
});

it("answers 503 when the bucket is not configured", async () => {
  const res = await postFile(appWithoutBucket, jpegOf(1000));
  expect(res.status).toBe(503);
});

it("refuses a file whose NAME carries a phone number", async () => {
  // The client checks this too, for immediate feedback. This is the gate:
  // a client-side check is bypassed with one `curl`, and a file name is the
  // obvious way around a rule about the message body.
  const res = await postFile(app, jpegNamed("liga-me-841234567.jpg"));
  expect(res.status).toBe(422);
});

it("serves a download as an attachment, never inline", async () => {
  const res = await app.request(`/api/communication/attachments/${id}`, {}, envWithSession(customer));
  expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
});

it("gives a stranger the same answer as a missing attachment", async () => {
  const mine = await app.request(`/api/communication/attachments/${id}`, {}, envWithSession(stranger));
  const missing = await app.request(`/api/communication/attachments/${crypto.randomUUID()}`, {}, envWithSession(customer));
  expect(mine.status).toBe(missing.status);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/backend/api && bun test src/__tests__/attachments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the routes**

Upload: session, read the file, refuse over `MAX_ATTACHMENT_BYTES` with 413, run `hasContact(file.name)` and refuse with 422, sniff the bytes and refuse `null` with 415, `bucket.put`, return the descriptor. The file goes to R2 **before** any row is written — the reverse leaves a message pointing at a file that does not exist, while this leaves a sweepable orphan.

The file-name check imports the **same** `hasContact` from `packages/shared` that the browser uses. That is the whole reason the detector lives there: two implementations would drift, and the day they drift the client accepts what the server refuses.

Download: session, `findVisible`, then

```ts
return new Response(object.body as unknown as BodyInit, {
  headers: {
    "content-type": row.contentType,
    "cache-control": "private, no-store",
    // `attachment`, never `inline`. documents.ts uses inline because its
    // reader is an admin reviewing an ID card; this file came from a
    // stranger, and forcing a download takes away its ability to execute on
    // our origin.
    "content-disposition": `attachment; filename="${row.fileName.replace(/"/g, "")}"`,
  },
});
```

- [ ] **Step 4: Declare the bucket**

`types.ts`: `ATTACHMENTS_BUCKET?: R2Bucket;`

`wrangler.jsonc`: add to `r2_buckets` in **each** of `env.dev`, `env.qa`, `env.prod`, following the shape `DOCUMENTS_BUCKET` already uses.

- [ ] **Step 5: Run and watch it pass**

Run: `cd apps/backend/api && bun test src && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Prove the two that fail silently**

| Mutation | Must red |
|---|---|
| `content-disposition` changed to `inline` | the disposition test |
| the sniffed type replaced by the client's `file.type` | the HTML-as-PDF test |

Neither breaks anything visible in production. That is why they need a test rather than a comment.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/api/src apps/backend/api/wrangler.jsonc
git commit -m "feat(api): take a file, and hand it back only to the conversation"
```

---

## Task 6: Attachments on the read side

**Files:**
- Modify: `packages/shared/src/read-models/system/communication/message.schema.ts`
- Modify: `.../read/communication/app/use-cases/*.projection.ts`
- Modify: `.../read/communication/graphql/schema/queries.ts`
- Test: `.../read/communication/__tests__/projections.test.ts` (extend)

**Interfaces:**
- Produces: `messageReadModel` gains `attachments: { id, fileName, contentType, sizeBytes }[]`, resolved **batched** for a page of messages via `listForMessages`.

- [ ] **Step 1: Write the failing test**

```ts
it("carries a message's attachments", async () => {
  const page = await projection.execute({ threadId, viewerUserId: customerId, limit: 20 });
  expect(page.items[0]!.attachments).toEqual([
    { id: a1, fileName: "orcamento.pdf", contentType: "application/pdf", sizeBytes: 1024 },
  ]);
});

it("asks for a page of messages in one call, not one per message", async () => {
  await projection.execute({ threadId, viewerUserId: customerId, limit: 20 });
  expect(fakeAttachments.listCallCount).toBe(1);
});
```

- [ ] **Step 2: Run, fail, implement, pass**

Follow how `providerName` is already resolved in `toThreadSummaries` — batched, one query per page.

- [ ] **Step 3: Verify the field reaches the wire**

Introspect a running server rather than reading the source: the emitted `communicationThreadMessages` item must carry `attachments`. Use a port other than 8788 or 3000 and stop it afterwards.

Then drop `attachments` from the selection set in the frontend repository test's expectations and confirm a test reds — a field that reaches the schema and not the query renders nothing, with every test green.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src packages/backend/src/modules/ntizo/read
git commit -m "feat(communication): a message's files come back with it"
```

---

## Task 7: Sending and showing a file

**Files:**
- Create: `apps/frontend/web/src/features/messaging/data/attachment.repository.ts`
- Create: `.../messaging/viewmodel/use-attachments.ts`
- Create: `.../messaging/ui/{attachment-picker.tsx,attachment-list.tsx}`
- Modify: `.../messaging/ui/message-composer.tsx`, `.../messaging/ui/thread-view.tsx`
- Modify: `.../messaging/domain/types.ts`
- Create: `shared/locales/*/messaging.json` keys (eight files)
- Test: `.../messaging/ui/__tests__/{message-composer,thread-view}.test.tsx` (extend)

**Interfaces:**
- Consumes: `findContacts`/`hasContact` from Task 1; `ACCEPTED_ATTACHMENT_TYPES` from Task 3, as the picker's `accept` attribute; the upload endpoint from Task 5.
- Produces: `useAttachments()` → `{ files, add, remove, uploading, uploadAll }`.

Follow `features/provider/data/document.repository.ts:28-52` for the upload — `FormData`, `fetch` with `credentials: "include"`, and its careful JSON parsing that tolerates a proxy error page instead of throwing a raw `SyntaxError`.

- [ ] **Step 1: Write the failing test**

```ts
it("warns while typing, not on submit", async () => {
  render(<MessageComposer onSend={onSend} />);
  await user.type(screen.getByRole("textbox"), "liga-me 84 123 4567");
  expect(screen.getByRole("alert")).toHaveTextContent(/não é possível partilhar/i);
});

it("refuses to send a message containing a number", async () => {
  render(<MessageComposer onSend={onSend} />);
  await user.type(screen.getByRole("textbox"), "841234567");
  await user.click(screen.getByRole("button", { name: /enviar/i }));
  expect(onSend).not.toHaveBeenCalled();
});

it("refuses a file whose name carries a number", async () => {
  render(<MessageComposer onSend={onSend} />);
  await upload(screen.getByLabelText(/anexar/i), fileNamed("liga-me-841234567.jpg"));
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it("renders a file name as text, never as markup", () => {
  render(<ThreadView messages={[withAttachment('<img src=x onerror=alert(1)>.pdf')]} />);
  expect(screen.queryByRole("img")).toBeNull();
});

it("does not fetch an attachment until it is opened", () => {
  render(<ThreadView messages={[withAttachment("foto.jpg")]} />);
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, fail, implement, pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/messaging`

- [ ] **Step 3: Write the copy in eight locales**

`DEFAULT_LOCALE` is `pt-MZ`. The refusal must be **true**: we cannot say "book through Ntizo" while booking through Ntizo does not exist. What is true is that the conversation is on the record and there is somebody to appeal to — write in that register, natively per locale, matching each file's existing form of address (`es-ES` uses *tú*, `fr-FR` *vous*, `pt` the formal implied *você*).

Add the two assertions the existing parity test cannot make, because it only asks whether locales agree with each other: no two keys within a locale share a value, and every `{{placeholder}}` resolves.

- [ ] **Step 4: Prove the escaping test can fail**

Switch the file-name render to `dangerouslySetInnerHTML`, confirm a real `<img>` materialises and the test reds, then restore. A test asserting escaped output against a path that was never dangerous proves nothing.

- [ ] **Step 5: Prove the warning is not decorative**

Replace `hasContact(text)` with `false` in the composer. Expected: the warn and the refuse-to-send tests red. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(messaging): send a photo, and keep the number out of the message"
```

---

## Task 8: End to end, and what is left open

**Files:**
- Create: `apps/e2e/tests/attachments.spec.ts`
- Modify: `docs/superpowers/follow-ups.md`

- [ ] **Step 1: Write the spec**

A customer uploads a PDF in a conversation and the provider opens it — two browser contexts, two real users, through the UI rather than direct database writes. Then: a third user, neither the customer nor a member of that provider, requests the same attachment id and gets what a missing attachment gets.

The harness needs its throwaway Postgres:

```
docker run --rm -d --name ntizo-e2e-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ntizo_e2e -p 55432:5432 postgres:16-alpine
```

Clean up in a `finally`: attachments, then messages, then threads, then the provider, then the users, scoped by id. And delete the R2 objects — the earlier phase left an orphaned row because a test cleaned up the user it created but not the row the *system* wrote as a side effect, and a bucket object is exactly that kind of leftover.

- [ ] **Step 2: Prove it tests the path**

Comment out the mount of `attachments.ts` in `api.ts` and confirm the spec fails. Restore, confirm green, confirm `git status --porcelain` empty.

A green e2e that survives that mutation is not testing what its name says.

- [ ] **Step 3: Record what is left open**

Add follow-ups in the file's existing format, each with a **Trigger**:

- **Attachment contents are not inspected.** A photograph of a business card, or a number written on paper, passes. Catching it needs OCR on every upload — slow, costly, still avoidable. Trigger: the first time a provider is found routing contacts through photographs.
- **No virus scanning.** R2 stores what it is given. Trigger: the first accepted file type that can execute on a recipient's machine, or the first report.
- **`media.ts` still trusts `file.type`.** The avatar, category and provider-media routes decide with a value the uploader chose. This task's endpoint does not; the older ones were left alone. Trigger: the next change to any of those three routes.
- **Orphaned R2 objects are never swept.** An upload that succeeds while its message write fails leaves a file nobody references. Trigger: the first storage bill that looks wrong, or a sweep becoming cheap to write.
- **Contact detection is refused without an alternative.** Until on-platform payment exists there is nothing to offer somebody who wants to arrange things off it. Trigger: the payment step landing — the copy should change the same day.

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/tests/attachments.spec.ts docs/superpowers/follow-ups.md
git commit -m "test(messaging): prove a file crosses, and only to the conversation"
```
