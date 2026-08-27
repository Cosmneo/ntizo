import { test, expect, type Page } from "@playwright/test";
import { createVerifiedUser, type VerifiedUser } from "../fixtures/auth";
import { createProvider } from "../fixtures/provider";
import { fillSignInForm } from "../fixtures/ui";
import { sql } from "../fixtures/db";

/**
 * The seam none of Communication's unit tests can see: a real customer,
 * signed in through the real form, opening a real provider's public page,
 * clicking the button that calls `communicationStartThread`, typing into the
 * real composer, and a *second*, independently signed-in browser context —
 * the provider's own owner — reading that exact message back out of the
 * real provider inbox. Every layer underneath this (aggregates,
 * repositories, commands, the six GraphQL fields, the frontend data layer,
 * both inboxes) is unit-tested in isolation. None of those tests can see:
 *
 * - a GraphQL field that is declared in the schema but never mounted in
 *   `private.ts` (`buildPrivateGraphQLFields`'s own doc comment: this
 *   project shipped eight such handlers once, every test green, the only
 *   symptom an endpoint that silently returned nothing);
 * - an authorization check (`ThreadRepositoryPort.findVisible`) that has
 *   only ever been called by its own owner in a test double.
 *
 * So this file's job is not "does `communicationSend` return the right
 * shape" — every unit test already answers that. It is "does a message
 * typed by one real person, in one real browser, actually reach a second
 * real person's screen, through the mounted wiring, end to end." Verified by
 * mutation: commenting out `...createCommunicationWriteHandlers` in
 * `apps/backend/api/src/graphql/private.ts` turns this file red.
 *
 * **Cleanup runs in `finally`, scoped by id, never a global `DELETE`** — the
 * same discipline `activity.spec.ts` documents, and for the same reason:
 * this suite's rows are not just the users this file explicitly creates.
 * Sending a message through the real UI is exactly the kind of row a test
 * doesn't "insert" so much as cause the system to write — a thread (upserted
 * by `StartThreadCommand`) and a message, both owned by nobody's foreign key
 * back to this test. `ntizo_communication.thread.provider_id` has no
 * `onDelete: cascade` (`thread.schema.ts`), so the provider row cannot be
 * deleted while a thread still points at it — messages, then threads, then
 * the provider (and its membership row), then the users, in that order.
 */

async function signIn(page: Page, user: VerifiedUser, expectedUrl: string | RegExp): Promise<void> {
  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL(expectedUrl);
}

/**
 * Locates a message's own bubble, never its echo in the thread list.
 *
 * `getByText(body)` alone is ambiguous on both inbox pages once a
 * conversation has been opened: `ThreadList`'s row renders the identical
 * string again as `thread.lastMessagePreview` (a `<span>`, visually
 * `truncate`d by CSS only — the full text is still in the DOM, so
 * `getByText` still matches it) beside `ThreadView`'s own `<p>` for the same
 * message. Scoping to the paragraph role is what `thread-view.tsx` actually
 * renders a message body as (`<p className="... whitespace-pre-wrap ...">`)
 * and `ThreadList` never does — verified empirically: an unscoped
 * `getByText` here failed with Playwright's own "strict mode violation:
 * resolved to 2 elements" the first time this test ran.
 */
function messageBubble(page: Page, body: string) {
  return page.getByRole("paragraph").filter({ hasText: body });
}

/**
 * Opens the provider's public page and clicks the button `provider-hero.tsx`
 * documents as "the way into the Communication context from anywhere in the
 * directory" — `MessageProviderButton`. Returns the thread id
 * `communicationStartThread` resolved, read back out of the URL
 * `?thread=<id>` search param the button's own navigation lands on, never
 * queried from the database: the id this test asserts against is the one a
 * real customer's real click actually produced.
 *
 * **Retries the click itself, not just the wait.** `/providers/$slug` is
 * `ssr: true` (`routes/providers.$slug.tsx`) — the button lands in the DOM
 * from the server's own HTML, visible to `toBeVisible()`, before React has
 * necessarily finished hydrating and attaching its `onClick`. A click inside
 * that window is an ordinary DOM click nothing is listening for yet, and is
 * silently lost — confirmed empirically: `toBeVisible()` immediately
 * followed by one `.click()` reproducibly clicked nothing, with no error,
 * no `communicationStartThread` request on the wire, and no navigation.
 * Safe to retry the click itself, not just the wait for it: `StartThreadCommand`
 * resolves through `openOrFind`, an upsert against `thread_customer_provider_uq`
 * (see `use-start-thread.ts`'s own doc comment), so a second click landing
 * after the first already registered returns the same thread rather than
 * opening a second one.
 */
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
    throw new Error("[e2e] messaging: no thread id in the URL after starting a conversation");
  }
  return threadId;
}

/** Same three-table order every cleanup in this file follows — see this file's own doc comment for why the order is load-bearing, not cosmetic. */
async function cleanupMessagingFixture(input: {
  threadId: string | null;
  providerId: string;
  users: readonly VerifiedUser[];
}): Promise<void> {
  if (input.threadId) {
    await sql()`DELETE FROM ntizo_communication.message WHERE thread_id = ${input.threadId}`.catch(
      (err) => console.error("[e2e] messaging cleanup: message delete failed", err),
    );
    await sql()`DELETE FROM ntizo_communication.thread WHERE id = ${input.threadId}`.catch((err) =>
      console.error("[e2e] messaging cleanup: thread delete failed", err),
    );
  }
  await sql()`DELETE FROM ntizo_provider.provider_member WHERE provider_id = ${input.providerId}`.catch(
    (err) => console.error("[e2e] messaging cleanup: provider_member delete failed", err),
  );
  await sql()`DELETE FROM ntizo_provider.provider WHERE id = ${input.providerId}`.catch((err) =>
    console.error("[e2e] messaging cleanup: provider delete failed", err),
  );
  for (const user of input.users) {
    // Cascades to ntizo_user.profile (profile.schema.ts's onDelete: "cascade").
    await sql()`DELETE FROM ntizo_user."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] messaging cleanup: ntizo_user.user delete failed", err),
    );
    // Cascades to better_auth.session and better_auth.account.
    await sql()`DELETE FROM better_auth."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] messaging cleanup: better_auth.user delete failed", err),
    );
  }
}

test("a customer writes to a provider and the provider sees it", async ({ browser }) => {
  const customer = await createVerifiedUser(undefined, { firstName: "Cora", lastName: "Crossing" });
  const owner = await createVerifiedUser(undefined, { firstName: "Otto", lastName: "Owner" });
  const slug = `msg-e2e-${crypto.randomUUID().slice(0, 8)}`;
  const providerId = await createProvider({
    name: "Messaging Crossing Co",
    slug,
    ownerUserId: owner.id,
  });
  const body = `Hello — are you available this week? (${crypto.randomUUID().slice(0, 8)})`;

  let threadId: string | null = null;
  const customerCtx = await browser.newContext();
  const ownerCtx = await browser.newContext();

  try {
    const customerPage = await customerCtx.newPage();
    // A brand-new customer owns no provider and holds no elevated role, so
    // resolvePostLoginDestination sends them to "/" (see auth.spec.ts).
    await signIn(customerPage, customer, "http://localhost:3000/");

    threadId = await startThreadFromProviderPage(customerPage, slug);

    await customerPage.getByLabel("Message body", { exact: true }).fill(body);
    await customerPage.getByRole("button", { name: /^send$/i }).click();
    // Proof the send actually resolved (`useSendMessage` does no optimistic
    // update — see its own doc comment) before this test ever looks at the
    // other side. If this never appears, the provider side was never going
    // to see anything either, and failing here says which half broke.
    await expect(messageBubble(customerPage, body)).toBeVisible();

    const ownerPage = await ownerCtx.newPage();
    // The owner owns exactly one provider, so resolvePostLoginDestination
    // sends them straight into its workspace (see zones.spec.ts /
    // provider.spec.ts for the same redirect on the same shape of account).
    await signIn(ownerPage, owner, /\/provider\/[^/]+\/overview/);

    await ownerPage.goto(`/provider/${slug}/messages`);
    // Exactly one conversation exists in this fresh, single-purpose
    // provider's inbox — the one the customer just opened — so selecting by
    // the customer's own name (`ThreadList`'s `nameOf` on this page reads
    // `customerName`, not `providerName`; see `provider-messages-page.tsx`)
    // is unambiguous without needing the thread id in a selector at all.
    await ownerPage.getByRole("button", { name: new RegExp(customer.firstName) }).click();

    // The whole point of this file: a real message, typed by one signed-in
    // browser, read back by a second, independently signed-in browser,
    // through the mounted GraphQL wiring and the real inbox UI — not a
    // database read on either side.
    await expect(messageBubble(ownerPage, body)).toBeVisible();
  } finally {
    await customerCtx.close();
    await ownerCtx.close();
    await cleanupMessagingFixture({ threadId, providerId, users: [customer, owner] });
  }
});

/**
 * Mirrors `data/messaging.repository.ts`'s `THREAD_MESSAGES` exactly — same
 * field name (`communicationThreadMessages`, flattened, never nested
 * `communication { threadMessages }`), same input type name
 * (`CommunicationThreadMessagesInput!`). Declared here rather than imported:
 * this package has no dependency on the frontend app's `src`, only on
 * `@ntizo/shared`, and the whole point of a raw call is to hit the wire the
 * same way that file does without going through its own code.
 */
const THREAD_MESSAGES_QUERY = `
  query ThreadMessages($input: CommunicationThreadMessagesInput!) {
    communicationThreadMessages(input: $input) {
      items { id threadId senderUserId body readAt createdAt }
      nextCursor
    }
  }`;

interface RawGraphQLResponse {
  data?: unknown;
  errors?: Array<{ message: string; extensions?: { code?: string; originalCode?: string } }>;
}

async function queryThreadMessagesAs(page: Page, threadId: string): Promise<RawGraphQLResponse> {
  const response = await page.request.post("/graphql", {
    headers: {
      "Content-Type": "application/json",
      // Required by the server's CSRF-prevention plugin — see
      // session-graphql.ts's identical header on the real frontend client.
      "x-graphql-csrf": "1",
    },
    data: { query: THREAD_MESSAGES_QUERY, variables: { input: { threadId, limit: 10 } } },
  });
  return (await response.json()) as RawGraphQLResponse;
}

test("a stranger cannot read the conversation, and gets the same refusal a missing thread gives", async ({
  browser,
}) => {
  const customer = await createVerifiedUser(undefined, { firstName: "Nadia", lastName: "Neighbor" });
  const owner = await createVerifiedUser(undefined, { firstName: "Percy", lastName: "Provider" });
  const stranger = await createVerifiedUser(undefined, { firstName: "Sam", lastName: "Stranger" });
  const slug = `msg-e2e-stranger-${crypto.randomUUID().slice(0, 8)}`;
  const providerId = await createProvider({
    name: "Stranger Test Co",
    slug,
    ownerUserId: owner.id,
  });

  let threadId: string | null = null;
  const customerCtx = await browser.newContext();
  const strangerCtx = await browser.newContext();

  try {
    const customerPage = await customerCtx.newPage();
    await signIn(customerPage, customer, "http://localhost:3000/");
    // A real thread, opened through the real button — same helper test 1
    // uses. Its existence (not its contents) is what this test probes: the
    // stranger below is neither this customer nor a member of this
    // provider, and must be refused all the same.
    threadId = await startThreadFromProviderPage(customerPage, slug);

    const strangerPage = await strangerCtx.newPage();
    await signIn(strangerPage, stranger, "http://localhost:3000/");

    const foreignThread = await queryThreadMessagesAs(strangerPage, threadId);
    // A syntactically valid id nothing ever inserted — not a garbage string,
    // which would fail zod's `.min(1)` check or Postgres's own uuid parser
    // before ever reaching `findVisible` and would prove nothing about the
    // authorization gate this test exists to check.
    const missingThreadId = crypto.randomUUID();
    const missingThread = await queryThreadMessagesAs(strangerPage, missingThreadId);

    // `ThreadNotVisibleError`'s own doc comment: "not yours" and "doesn't
    // exist" must answer identically, or a caller probing thread ids could
    // tell real ones from fake ones apart by the error shape alone. Checked
    // on the wire, not against the domain exception directly — confirmed
    // shape per messaging-error.ts's own doc comment:
    // `extensions: { code: "UNPROCESSABLE", originalCode: "THREAD_NOT_VISIBLE" }`.
    //
    // `data` is present but null for the failing field, per the GraphQL
    // spec's own rule for a field-level error (`{ data: { communicationThreadMessages: null }, errors: [...] }`)
    // — not omitted, so the refusal is read off `errors`, never off `data`'s
    // mere presence or absence.
    expect((foreignThread.data as { communicationThreadMessages: unknown } | undefined)?.communicationThreadMessages).toBeNull();
    expect(foreignThread.errors?.[0]?.extensions?.originalCode).toBe("THREAD_NOT_VISIBLE");
    expect((missingThread.data as { communicationThreadMessages: unknown } | undefined)?.communicationThreadMessages).toBeNull();
    expect(missingThread.errors?.[0]?.extensions?.originalCode).toBe("THREAD_NOT_VISIBLE");
    // Same message too — the two refusals are not merely both
    // THREAD_NOT_VISIBLE, they are the identical response.
    expect(foreignThread.errors?.[0]?.message).toBe(missingThread.errors?.[0]?.message);
  } finally {
    await customerCtx.close();
    await strangerCtx.close();
    await cleanupMessagingFixture({ threadId, providerId, users: [customer, owner, stranger] });
  }
});
