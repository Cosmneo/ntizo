import { z } from "zod";

/**
 * The two things somebody can write to us about, named after the form each
 * arrives from. Support with an account is the help center's (its own spec). One vocabulary for the write tier, the read tier and the
 * frontend, so a topic added to the form cannot be one the aggregate refuses.
 */
export const CONTACT_REQUEST_KINDS = ["contact", "feedback"] as const;
export type ContactRequestKind = (typeof CONTACT_REQUEST_KINDS)[number];
export const contactRequestKindSchema = z.enum(CONTACT_REQUEST_KINDS);

/**
 * What each form asks the person to file their message under. Stored as text
 * on the row; validated against this list by the aggregate, per kind.
 */
export const CONTACT_TOPICS = {
  contact: ["general", "partnership", "press", "provider", "other"],
  feedback: ["idea", "problem", "praise"],
} as const satisfies Record<ContactRequestKind, readonly string[]>;
export type ContactTopic = (typeof CONTACT_TOPICS)[ContactRequestKind][number];

export function isContactTopicForKind(kind: ContactRequestKind, topic: string): topic is ContactTopic {
  return (CONTACT_TOPICS[kind] as readonly string[]).includes(topic);
}

export const CONTACT_REQUEST_STATUSES = ["open", "resolved"] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];
export const contactRequestStatusSchema = z.enum(CONTACT_REQUEST_STATUSES);

/** Feedback may arrive with no way to reply; a question or a problem needs one. */
export function contactEmailRequired(kind: ContactRequestKind): boolean {
  return kind !== "feedback";
}

/**
 * The reference a person quotes back to us: the first six hex characters of
 * the request id, upper-cased. Six of a uuid's first group are contiguous,
 * so the admin search can match `id::text ILIKE '<ref>%'` without stripping
 * hyphens.
 */
export const CONTACT_REFERENCE_LENGTH = 6;
export function contactReferenceOf(id: string): string {
  return id.replace(/-/g, "").slice(0, CONTACT_REFERENCE_LENGTH).toUpperCase();
}
