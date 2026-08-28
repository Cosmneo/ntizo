/**
 * The limits an attachment must satisfy, in the one place both sides can
 * read them.
 *
 * These lived in two copies — `packages/backend`'s communication domain and
 * `apps/frontend/web`'s messaging domain — each with an honest comment
 * saying it mirrored the other. The mirroring was the problem. The design
 * note that put `hasContact` in this package already made the argument, and
 * it applies here word for word: a rule enforced in the client and in the
 * server needs one definition, because the day the two drift is the day the
 * client accepts what the server refuses.
 *
 * Raise `MAX_ATTACHMENT_BYTES` in one copy only, and a file the picker
 * happily uploads comes back 413. Add a format to one copy only, and either
 * the file dialog will not offer it or the server will not store it. Both
 * are silent.
 *
 * What this is NOT: enforcement. The server decides an attachment's type
 * from its leading bytes (`sniffContentType`), never from this list and
 * never from the `file.type` the uploader declared. On the client these are
 * a courtesy — refuse early, spend no upload on a file that was always
 * going to be refused — and on the server the size limit is a real gate.
 */

/** 10 MB. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** How many files may ride with one message. */
export const MAX_ATTACHMENTS = 5;

/**
 * The only content types an attachment may be stored as, and everything
 * `sniffContentType` can return.
 *
 * SVG is absent deliberately: it is an image format that can carry script,
 * and serving one back to the other side of a conversation would be XSS
 * with our own signature on it.
 */
export const ACCEPTED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** What `sniffContentType` resolves a file to, when it resolves at all. */
export type AcceptedAttachmentType = (typeof ACCEPTED_ATTACHMENT_TYPES)[number];
