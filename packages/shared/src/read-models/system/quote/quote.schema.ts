import { z } from "zod";
import {
  QUOTE_ATTACHMENT_STEPS,
  QUOTE_EXPIRED_CAUSES,
  QUOTE_SUPERSEDED_CAUSES,
  quoteStatusSchema,
} from "../../../enums/quote-enums";

/** A file on a quote. The URL is `/api/quote/attachments/<id>`, built by the client. */
export const quoteAttachmentReadModel = z.object({
  id: z.string().min(1),
  step: z.enum(QUOTE_ATTACHMENT_STEPS),
  proposalId: z.string().nullable(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
});

export const quoteProposalReadModel = z.object({
  id: z.string().min(1),
  priceMinor: z.number().int(),
  currency: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int(),
  providerMemberId: z.string(),
  memberFirstName: z.string(),
  note: z.string().nullable(),
  validUntil: z.string(),
  createdAt: z.string(),
  supersededAt: z.string().nullable(),
  supersededCause: z.enum(QUOTE_SUPERSEDED_CAUSES).nullable(),
  attachments: z.array(quoteAttachmentReadModel),
});

/** The customer's own address on the quote, in full. The provider never receives this shape. */
export const quoteAddressReadModel = z.object({
  label: z.string(),
  line: z.string(),
  city: z.string(),
  district: z.string().nullable(),
  directions: z.string().nullable(),
});

const quoteCore = {
  id: z.string().min(1),
  status: quoteStatusSchema,
  serviceId: z.string(),
  serviceName: z.string(),
  providerId: z.string(),
  /** The provider's timezone, for rendering `startsAt` and the clocks. */
  timezone: z.string(),
  threadId: z.string(),
  /** Whichever clock is running; null once terminal. */
  expiresAt: z.string().nullable(),
  expiredCause: z.enum(QUOTE_EXPIRED_CAUSES).nullable(),
  closedReason: z.string().nullable(),
  bookingId: z.string().nullable(),
  requestedAt: z.string(),
  /** The live proposal, or null while REQUESTED / after a closing that had none. */
  proposal: quoteProposalReadModel.nullable(),
};

export const customerQuoteReadModel = z.object({
  ...quoteCore,
  providerName: z.string(),
  providerSlug: z.string(),
  providerVerified: z.boolean(),
});

export const customerQuoteDetailReadModel = customerQuoteReadModel.extend({
  description: z.string(),
  neededBy: z.string().nullable(),
  address: quoteAddressReadModel.nullable(),
  requestAttachments: z.array(quoteAttachmentReadModel),
  /** Every proposal, newest first, superseded ones included. */
  proposals: z.array(quoteProposalReadModel),
  closedNote: z.string().nullable(),
  closingAttachments: z.array(quoteAttachmentReadModel),
});

export const customerQuotePageReadModel = z.object({
  items: z.array(customerQuoteReadModel),
  counts: z.object({ open: z.number().int(), history: z.number().int() }),
  hasMore: z.boolean(),
});

export const providerQuoteReadModel = z.object({
  ...quoteCore,
  customerFirstName: z.string(),
  /** District and city only before the booking is CONFIRMED — the reveal rule. */
  addressDistrict: z.string().nullable(),
  addressCity: z.string().nullable(),
  neededBy: z.string().nullable(),
  descriptionSnippet: z.string(),
  attachmentCount: z.number().int(),
});

export const quotePerformerReadModel = z.object({
  id: z.string().min(1),
  firstName: z.string(),
});

export const providerQuoteDetailReadModel = providerQuoteReadModel.extend({
  description: z.string(),
  customerCompletedBookings: z.number().int(),
  requestAttachments: z.array(quoteAttachmentReadModel),
  proposals: z.array(quoteProposalReadModel),
  closedNote: z.string().nullable(),
  closingAttachments: z.array(quoteAttachmentReadModel),
  /** The provider's own rate, for the "o cliente paga / recebes" split. */
  commissionBps: z.number().int(),
  /** Members who perform this service; the proposal form's member picker. */
  performers: z.array(quotePerformerReadModel),
});

export const providerQuotePageReadModel = z.object({
  items: z.array(providerQuoteReadModel),
  counts: z.object({
    toAnswer: z.number().int(),
    waiting: z.number().int(),
    history: z.number().int(),
  }),
  hasMore: z.boolean(),
});

export const providerQuoteCountsReadModel = z.object({ toAnswer: z.number().int() });

export type QuoteAttachmentDTO = z.infer<typeof quoteAttachmentReadModel>;
export type QuoteProposalDTO = z.infer<typeof quoteProposalReadModel>;
export type QuoteAddressDTO = z.infer<typeof quoteAddressReadModel>;
export type CustomerQuoteDTO = z.infer<typeof customerQuoteReadModel>;
export type CustomerQuoteDetailDTO = z.infer<typeof customerQuoteDetailReadModel>;
export type CustomerQuotePageDTO = z.infer<typeof customerQuotePageReadModel>;
export type ProviderQuoteDTO = z.infer<typeof providerQuoteReadModel>;
export type ProviderQuoteDetailDTO = z.infer<typeof providerQuoteDetailReadModel>;
export type ProviderQuotePageDTO = z.infer<typeof providerQuotePageReadModel>;
export type ProviderQuoteCountsDTO = z.infer<typeof providerQuoteCountsReadModel>;
