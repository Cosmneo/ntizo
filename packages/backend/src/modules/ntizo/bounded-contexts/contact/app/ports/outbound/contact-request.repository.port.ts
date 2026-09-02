import type { ContactRequestKind, ContactRequestStatus, ContactTopic } from "@ntizo/shared";
import type { ContactRequest } from "../../../domain/aggregates/contact-request.aggregate";

/** One request as the administration list shows it. Everything on the row: this screen is the investigation. */
export interface ContactRequestAdminRow {
  id: string;
  reference: string;
  kind: ContactRequestKind;
  topic: ContactTopic;
  name: string;
  email: string | null;
  message: string;
  requesterUserId: string | null;
  locale: string;
  originPath: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: ContactRequestStatus;
  /** ISO 8601, or null while open. */
  resolvedAt: string | null;
  createdAt: string;
}

export interface ContactRequestListInput {
  limit: number;
  offset: number;
  kind?: ContactRequestKind;
  status?: ContactRequestStatus;
  /** Matches the name, the email, the message, or the id's leading characters (the reference). */
  search?: string;
}

export interface ContactRequestAdminPage {
  items: ContactRequestAdminRow[];
  /** Rows matching the filters, for pagination. */
  total: number;
  /** Open rows across the whole table, whatever the filters — the queue's badge. */
  openCount: number;
}

export interface ContactRequestRepositoryPort {
  /** Writes a new row and returns the same request carrying its id and creation time. */
  insert(request: ContactRequest): Promise<ContactRequest>;
  findById(id: string): Promise<ContactRequest | null>;
  /** Writes `status`, `resolvedAt` and `resolvedByUserId`. False when no such row. */
  saveStatus(request: ContactRequest): Promise<boolean>;
  /** How many rows this address has written since `since`. The rate limit. */
  countFromIpSince(ipAddress: string, since: Date): Promise<number>;
  listForAdmin(input: ContactRequestListInput): Promise<ContactRequestAdminPage>;
}
