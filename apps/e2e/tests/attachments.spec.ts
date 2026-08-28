import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createVerifiedUser, type VerifiedUser } from "../fixtures/auth";
import { createProvider } from "../fixtures/provider";
import { fillSignInForm } from "../fixtures/ui";
import { sql } from "../fixtures/db";
import { resolveNode22 } from "../lib/resolve-node22";

/**
 * The seam none of the seven tasks before this one can see: a real file,
 * picked in a real browser, uploaded through `POST /api/communication/
 * attachments`, riding a real `communicationSend` mutation over `/graphql`,
 * and read back through `GET /api/communication/attachments/:id` by a
 * *second*, independently signed-in browser. Every layer under this is
 * unit-tested — the sniffer, the repository, the two routes, the read
 * model, the send mutation, the composer. None of those tests go through
 * Yoga, which is where this feature's one unproven claim lives:
 * `mountPrivateGraphql` (`apps/backend/api/src/graphql/private.ts:175`)
 * wraps every `/graphql` request in `runWithAttachmentsBucket`, an
 * `AsyncLocalStorage` scope, so `AttachmentStorageAdapter.head` — called
 * from deep inside `SendMessageCommand.resolveAttachments` — can reach that
 * request's R2 bucket without it being threaded through Yoga's own context
 * factory. If that wrap were missing, `head` would see no bucket for every
 * request, `resolveAttachments` would treat every attachment as unresolvable,
 * and `SendMessageCommand` would throw `AttachmentNotAvailableError` for
 * every message that carries a file — this suite's first test would fail to
 * see its own message appear, not with a subtle diff but outright. Verified
 * by mutation: commenting out `mountAttachments(app, {...})` in
 * `apps/backend/api/src/api.ts` (this file's own Step 2) turns both tests
 * red, because the upload leg 404s before either message can even attempt
 * to send.
 *
 * **Cleanup runs in `finally`, scoped by id, same discipline
 * `messaging.spec.ts` documents** — plus one thing that file never had to
 * clean up: the R2 object itself. `ntizo_communication.attachment` cascades
 * from `message` cascades from `thread`, so the *rows* would disappear on
 * their own; the bytes in the bucket would not — nothing sweeps them (see
 * `docs/superpowers/follow-ups.md`'s "Orphaned R2 objects are never swept"
 * entry). `deleteR2ObjectLocal` below is this test's own sweep, run against
 * the same local, file-persisted bucket the harness's un-`--env`'d
 * `wrangler dev` uses (`wrangler.jsonc`'s top-level `r2_buckets`, never the
 * `dev`/`qa`/`prod` blocks, which point at real Cloudflare buckets this
 * harness never touches).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const API_ROOT = path.join(REPO_ROOT, "apps/backend/api");
const WRANGLER_ENTRY = path.join(API_ROOT, "node_modules/wrangler/bin/wrangler.js");

/** `wrangler.jsonc`'s top-level `r2_buckets` entry for `ATTACHMENTS_BUCKET` — the one an un-`--env`'d `wrangler dev` binds, which is exactly how `playwright.config.ts`'s `api` webServer entry launches it. */
const ATTACHMENTS_BUCKET_NAME = "ntizo-attachments-local";

/**
 * Deletes one object from the local R2 store, best-effort.
 *
 * Shells out to the same `wrangler` binary and the same Node >= 22 binary
 * `playwright.config.ts` already resolves for the API's own `wrangler dev`
 * (see `lib/resolve-node22.ts`) — `wrangler r2 object delete` against
 * `--local` storage needs no running dev server, no credentials, and no
 * network; it edits the same on-disk store `wrangler dev` reads from.
 *
 * Never throws. A failed delete here must not fail a test that already
 * passed or failed on its own merits — same posture as every `.catch` in
 * this file's DB cleanup.
 */
function deleteR2ObjectLocal(storageKey: string): void {
  try {
    const result = spawnSync(
      resolveNode22(),
      [WRANGLER_ENTRY, "r2", "object", "delete", `${ATTACHMENTS_BUCKET_NAME}/${storageKey}`, "--local"],
      { cwd: API_ROOT, stdio: "pipe" },
    );
    if (result.status !== 0) {
      console.error(
        `[e2e] attachments cleanup: failed to delete R2 object ${storageKey}`,
        result.stderr?.toString() ?? result.error,
      );
    }
  } catch (err) {
    // `resolveNode22()` can throw (no Node >= 22 found) — this function's
    // own doc comment promises it never propagates, matching every other
    // cleanup step in this file.
    console.error(`[e2e] attachments cleanup: failed to delete R2 object ${storageKey}`, err);
  }
}

async function signIn(page: Page, user: VerifiedUser, expectedUrl: string | RegExp): Promise<void> {
  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL(expectedUrl);
}

/** Same reasoning as `messaging.spec.ts`'s own `messageBubble` — scoped to the paragraph `thread-view.tsx` renders a body as, never the thread list's truncated echo of the same string. */
function messageBubble(page: Page, body: string) {
  return page.getByRole("paragraph").filter({ hasText: body });
}

/** Same helper `messaging.spec.ts` documents at length — reproduced here because this file has no dependency on that one and the reasoning (retry the click, not just the wait, because `/providers/$slug` is SSR'd and can render before hydration attaches the click handler) applies identically. */
async function startThreadFromProviderPage(page: Page, slug: string): Promise<string> {
  await page.goto(`/providers/${slug}`);
  const button = page.getByRole("button", { name: /send message/i });
  await expect(button).toBeVisible();

  await expect(async () => {
    await button.click();
    await page.waitForURL(/\/messages\?thread=/, { timeout: 1_500 });
  }).toPass({ timeout: 15_000 });

  const threadId = new URL(page.url()).searchParams.get("thread");
  if (!threadId) {
    throw new Error("[e2e] attachments: no thread id in the URL after starting a conversation");
  }
  return threadId;
}

/**
 * Same three-DB-table order `messaging.spec.ts` follows, with one row type
 * added ahead of it: `attachment` — even though it cascades from `message`
 * (`attachment.schema.ts`'s `onDelete: "cascade"`), deleted explicitly for
 * the same belt-and-braces reason that file deletes `message` explicitly
 * despite `message` itself cascading from `thread`. `storageKeys` is swept
 * from R2 last, once every row that could reference it is already gone.
 */
async function cleanupAttachmentFixture(input: {
  threadId: string | null;
  storageKeys: readonly string[];
  providerId: string;
  users: readonly VerifiedUser[];
}): Promise<void> {
  if (input.threadId) {
    await sql()`
      DELETE FROM ntizo_communication.attachment
      WHERE message_id IN (SELECT id FROM ntizo_communication.message WHERE thread_id = ${input.threadId})
    `.catch((err) => console.error("[e2e] attachments cleanup: attachment delete failed", err));
    await sql()`DELETE FROM ntizo_communication.message WHERE thread_id = ${input.threadId}`.catch((err) =>
      console.error("[e2e] attachments cleanup: message delete failed", err),
    );
    await sql()`DELETE FROM ntizo_communication.thread WHERE id = ${input.threadId}`.catch((err) =>
      console.error("[e2e] attachments cleanup: thread delete failed", err),
    );
  }
  await sql()`DELETE FROM ntizo_provider.provider_member WHERE provider_id = ${input.providerId}`.catch(
    (err) => console.error("[e2e] attachments cleanup: provider_member delete failed", err),
  );
  await sql()`DELETE FROM ntizo_provider.provider WHERE id = ${input.providerId}`.catch((err) =>
    console.error("[e2e] attachments cleanup: provider delete failed", err),
  );
  for (const user of input.users) {
    // Cascades to ntizo_user.profile.
    await sql()`DELETE FROM ntizo_user."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] attachments cleanup: ntizo_user.user delete failed", err),
    );
    // Cascades to better_auth.session and better_auth.account.
    await sql()`DELETE FROM better_auth."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] attachments cleanup: better_auth.user delete failed", err),
    );
  }
  for (const storageKey of input.storageKeys) {
    deleteR2ObjectLocal(storageKey);
  }
}

/** A real, if minimal, PDF: `sniffContentType` only reads the leading `%PDF` magic bytes, but the body is genuine enough that a byte-for-byte round trip through R2 is a meaningful assertion, not a coincidence of a 4-byte file. */
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);

/** The same 1x1 PNG `profile.spec.ts` uses for its own real-upload proof — real PNG magic bytes, decodable, and tiny. */
const PNG_1X1_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a PDF crosses to the provider byte for byte, and a stranger gets what a missing attachment gets", async ({
  browser,
}) => {
  const customer = await createVerifiedUser(undefined, { firstName: "Paula", lastName: "PDFSender" });
  const owner = await createVerifiedUser(undefined, { firstName: "Oscar", lastName: "Owner" });
  const stranger = await createVerifiedUser(undefined, { firstName: "Sam", lastName: "Stranger" });
  const slug = `msg-e2e-attach-${crypto.randomUUID().slice(0, 8)}`;
  const providerId = await createProvider({ name: "Attachment Crossing Co", slug, ownerUserId: owner.id });
  const fileName = `quote-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const body = `Here is the quote (${crypto.randomUUID().slice(0, 8)})`;

  let threadId: string | null = null;
  const storageKeys: string[] = [];
  const customerCtx = await browser.newContext();
  const ownerCtx = await browser.newContext();
  const strangerCtx = await browser.newContext();

  try {
    const customerPage = await customerCtx.newPage();
    await signIn(customerPage, customer, "http://localhost:3000/");
    threadId = await startThreadFromProviderPage(customerPage, slug);

    await customerPage.getByLabel("Message body", { exact: true }).fill(body);
    await customerPage.locator("#message-attachment-input").setInputFiles({
      name: fileName,
      mimeType: "application/pdf",
      buffer: PDF_BYTES,
    });
    // The picker shows the picked file before send is even clicked — proof
    // the pick itself (client-side, no network yet) succeeded, so a failure
    // after this point is about upload/send, not about picking.
    await expect(customerPage.getByText(fileName)).toBeVisible();

    // Captured from the upload response itself, ahead of clicking Send —
    // not from a later DB read. The upload (Task 5's route) writes the R2
    // object BEFORE `communicationSend` ever runs; if the send half of this
    // click somehow failed, a DB-only capture would never learn the key at
    // all and this test would leak the very object it is supposed to sweep.
    // See `deleteR2ObjectLocal`'s own doc comment and the "photo with no
    // caption" test below for why this was worth hardening, not paranoia.
    const uploadResponse = customerPage.waitForResponse(
      (r) => r.url().includes("/api/communication/attachments") && r.request().method() === "POST",
    );
    await customerPage.getByRole("button", { name: /^send$/i }).click();
    const uploaded = (await (await uploadResponse).json()) as { storageKey: string };
    storageKeys.push(uploaded.storageKey);

    // `useSendMessage` does no optimistic update (see `messaging.spec.ts`),
    // so this is proof the upload AND the send both actually resolved.
    await expect(messageBubble(customerPage, body)).toBeVisible();

    // The row the SYSTEM wrote as a side effect of that send — never
    // inserted directly by this test. Only the id is needed from here now
    // that the storage key above no longer depends on this query succeeding.
    const [row] = await sql()<{ id: string; storage_key: string }[]>`
      SELECT a.id, a.storage_key
      FROM ntizo_communication.attachment a
      JOIN ntizo_communication.message m ON m.id = a.message_id
      WHERE m.thread_id = ${threadId}
      ORDER BY a.created_at DESC
      LIMIT 1
    `;
    expect(row?.id).toBeTruthy();
    const attachmentId = row!.id;

    const ownerPage = await ownerCtx.newPage();
    await signIn(ownerPage, owner, /\/provider\/[^/]+\/overview/);
    await ownerPage.goto(`/provider/${slug}/messages`);
    await ownerPage.getByRole("button", { name: new RegExp(customer.firstName) }).click();

    await expect(messageBubble(ownerPage, body)).toBeVisible();

    // Not an image — `AttachmentItem` renders it as a named file button
    // (`attachment-list.tsx`) whose click fetches the bytes and triggers a
    // real browser download via a JS-created `<a download>` anchor.
    const fileButton = ownerPage.getByRole("button", { name: fileName });
    await expect(fileButton).toBeVisible();
    const [download] = await Promise.all([ownerPage.waitForEvent("download"), fileButton.click()]);
    expect(download.suggestedFilename()).toBe(fileName);
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    // The whole point: bytes that left the customer's browser as a PDF
    // arrive at the provider's browser identical — through the real upload
    // route, the real bucket, the real `communicationSend` mutation (which
    // needed `runWithAttachmentsBucket`'s AsyncLocalStorage to resolve this
    // attachment at all), and the real download route.
    const downloadedBytes = await fs.promises.readFile(downloadedPath!);
    expect(downloadedBytes.equals(PDF_BYTES)).toBe(true);

    // A real, persisted third user — neither the customer on this thread
    // nor a member of this provider — asking for the SAME attachment id a
    // moment ago just worked for, over the real download route.
    const strangerPage = await strangerCtx.newPage();
    await signIn(strangerPage, stranger, "http://localhost:3000/");

    const realAttachment = await strangerPage.request.get(
      `/api/communication/attachments/${attachmentId}`,
    );
    // A syntactically valid id nothing ever inserted — not a garbage
    // string, which would prove nothing about the authorization gate this
    // assertion exists to check.
    const missingId = crypto.randomUUID();
    const missingAttachment = await strangerPage.request.get(`/api/communication/attachments/${missingId}`);

    // `findVisible`'s own doc comment: "not yours" and "doesn't exist" must
    // answer identically, or a caller probing attachment ids could tell
    // real ones from fake ones apart by the response shape alone.
    expect(realAttachment.status()).toBe(403);
    expect(missingAttachment.status()).toBe(403);
    const [realBody, missingBody] = await Promise.all([realAttachment.json(), missingAttachment.json()]);
    expect(realBody).toEqual({ error: "FORBIDDEN" });
    expect(realBody).toEqual(missingBody);
  } finally {
    await customerCtx.close();
    await ownerCtx.close();
    await strangerCtx.close();
    await cleanupAttachmentFixture({ threadId, storageKeys, providerId, users: [customer, owner, stranger] });
  }
});

test("a photo with no caption still sends", async ({ page }) => {
  const customer = await createVerifiedUser(undefined, { firstName: "Iris", lastName: "Imager" });
  const owner = await createVerifiedUser(undefined, { firstName: "Otto", lastName: "Owner" });
  const slug = `msg-e2e-photo-${crypto.randomUUID().slice(0, 8)}`;
  const providerId = await createProvider({ name: "Captionless Photo Co", slug, ownerUserId: owner.id });
  const fileName = `photo-${crypto.randomUUID().slice(0, 8)}.png`;

  let threadId: string | null = null;
  const storageKeys: string[] = [];

  try {
    await signIn(page, customer, "http://localhost:3000/");
    threadId = await startThreadFromProviderPage(page, slug);

    // Proof the empty conversation actually rendered before this test does
    // anything to it — the same "something resolved before we act on it"
    // discipline every other assertion in this file follows.
    await expect(page.getByRole("heading", { name: "Say hello" })).toBeVisible();

    // No text typed into the composer at all — the invariant this test
    // exists to prove: `Message.compose`'s own rule is "something in it,
    // not necessarily words" (Task 2), and was dead code — nothing could
    // ever reach it — until Task 6b removed the frontend's `.min(1)` on the
    // body field. If that removal regressed, `canSend` in
    // `message-composer.tsx` would stay false forever and this click would
    // do nothing.
    await page.locator("#message-attachment-input").setInputFiles({
      name: fileName,
      mimeType: "image/png",
      buffer: PNG_1X1_BYTES,
    });

    const sendButton = page.getByRole("button", { name: /^send$/i });
    await expect(sendButton).toBeEnabled();
    // Captured from the upload response itself — see test 1's identical
    // comment for why a DB-only capture leaks the object on any downstream
    // send failure. Precisely the shape this test's own investigation hit:
    // see `docs/superpowers/follow-ups.md`'s entry on `useSendMessage`
    // firing and forgetting.
    const uploadResponse = page.waitForResponse(
      (r) => r.url().includes("/api/communication/attachments") && r.request().method() === "POST",
    );
    await sendButton.click();
    const uploaded = (await (await uploadResponse).json()) as { storageKey: string };
    storageKeys.push(uploaded.storageKey);

    // Rendered as an image button (`attachment-list.tsx`'s `isImage` branch,
    // `aria-label={attachment.fileName}` exactly) once the message actually
    // arrives via `useThread`'s post-mutation refetch. `exact: true` is
    // load-bearing, not decoration: `AttachmentPicker`'s own preview row
    // (still on screen for the brief window between the click and
    // `MessageComposer`'s `reset()`) renders a remove button whose
    // accessible name is "Remove {fileName}" — a plain substring match on
    // `fileName` alone matches THAT button too, and is satisfied instantly
    // by the picker regardless of whether the mutation ever actually
    // succeeds server-side. Confirmed the hard way: without `exact: true`
    // this assertion passed even while `communicationSend` was failing
    // server-side, which is exactly the false-positive this comment warns
    // against making again.
    await expect(page.getByRole("button", { name: fileName, exact: true })).toBeVisible();
    // The negative half of the same claim: `thread-view.tsx`'s
    // `MessageBubble` only ever renders a `<p>` when `message.body` is
    // truthy — a caption-less message produces none. `messageBubble("")`
    // would match the picker's own now-emptied file-name text row too
    // (`toBeVisible()` on an empty-string filter matches everything), so
    // this checks the DB row directly instead of guessing at a UI locator
    // for "no text is here".
    const [row] = await sql()<{ id: string; body: string }[]>`
      SELECT m.id, m.body
      FROM ntizo_communication.message m
      JOIN ntizo_communication.attachment a ON a.message_id = m.id
      WHERE m.thread_id = ${threadId}
      ORDER BY m.created_at DESC
      LIMIT 1
    `;
    expect(row?.body).toBe("");
  } finally {
    await cleanupAttachmentFixture({ threadId, storageKeys, providerId, users: [customer, owner] });
  }
});
