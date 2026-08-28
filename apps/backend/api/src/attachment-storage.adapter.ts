import { AsyncLocalStorage } from "node:async_hooks";
import type { R2Bucket } from "@cloudflare/workers-types";
import type {
  AttachmentStoragePort,
  StoredAttachmentMetadata,
} from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";

/**
 * Carries this request's `ATTACHMENTS_BUCKET` binding down to wherever
 * `AttachmentStorageAdapter` actually runs.
 *
 * Needed because nothing else on the path from an incoming request to
 * `SendMessageCommand` carries it: a GraphQL resolver only ever receives
 * the plain `Request` `createGraphqlContextFactory` builds a context from
 * (see `graphql/context-factory.ts` — no `c.env` in sight), and
 * `bootstrapCommunication` itself runs once at module scope in
 * `graphql/private.ts`, before any request — and therefore any `c.env` —
 * exists at all.
 *
 * A dedicated `AsyncLocalStorage` rather than adding this to
 * `infraStore` (`packages/backend/src/shared/infrastructure/stores/infra-store.ts`):
 * that store is built to stay buildable without the Workers type package —
 * see `HyperdriveBinding`'s own doc comment, which hand-declares the one
 * Hyperdrive field it needs rather than importing `@cloudflare/workers-types`
 * for exactly this reason. `R2Bucket` has no such minimal substitute worth
 * hand-declaring, and this need is specific to one adapter in this one app,
 * not a cross-cutting concern the way the Postgres connection is.
 */
const bucketStorage = new AsyncLocalStorage<R2Bucket | undefined>();

/**
 * Runs `fn` with this request's attachments bucket visible to
 * `AttachmentStorageAdapter.head`, however deep the call that reaches it.
 *
 * `mountPrivateGraphql`'s `/graphql` handler is the one caller: it wraps the
 * whole Yoga `fetch()` — CORS included — so every resolver invoked while
 * handling that request, including `communication.send`, runs inside this
 * scope. `bucket` may be `undefined` (no binding configured, same as a
 * local `wrangler dev` run without one) — `head` below answers that the
 * same way it answers a missing object: null, never a throw.
 */
export function runWithAttachmentsBucket<T>(
  bucket: R2Bucket | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return bucketStorage.run(bucket, fn);
}

/**
 * The real `AttachmentStoragePort` — reads an R2 object's metadata, never
 * its body. `head`, not `get`: `SendMessageCommand.resolveAttachments`
 * never needs the bytes, only what R2 already recorded about them.
 *
 * Constructed once, at module scope, alongside `bootstrapCommunication`
 * itself (see `api.ts` and `graphql/private.ts`) — safe because it holds no
 * state of its own; every call reads the CURRENT request's bucket out of
 * `bucketStorage` instead. Same shape as `bootstrap.ts`'s
 * `LazyEmailServiceAdapter` / `LazySmsServiceAdapter`: registered once,
 * resolves the real per-request value at call time.
 */
export class AttachmentStorageAdapter implements AttachmentStoragePort {
  async head(storageKey: string): Promise<StoredAttachmentMetadata | null> {
    const bucket = bucketStorage.getStore();
    // No binding for this request (unconfigured locally, or called from
    // outside `runWithAttachmentsBucket` entirely) — answered the same way
    // a missing object is: null, and `SendMessageCommand` refuses the
    // attachment rather than trusting anything about it.
    if (!bucket) return null;

    const object = await bucket.head(storageKey);
    if (!object) return null;

    return {
      // Task 5's upload route always sets this; the fallback exists only
      // for an object this route did not write.
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      sizeBytes: object.size,
      uploadedByUserId: object.customMetadata?.uploadedByUserId ?? null,
      // Same fallback, same reason: the upload route always stamps this
      // (see `attachments.ts`'s `customMetadata: { ..., originalName }`).
      // `null` here means an object this route did not write, and
      // `SendMessageCommand.resolveAttachments` refuses it rather than
      // guessing a display name for it.
      originalName: object.customMetadata?.originalName ?? null,
    };
  }
}
