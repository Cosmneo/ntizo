import { and, desc, eq, ne } from "drizzle-orm";
import { ProviderDocumentStatus } from "@ntizo/shared";
import { getDb } from "../../../../better-auth/infrastructure/client/drizzle";
import { providerDocument } from "../database/provider/schemas";

export interface ProviderDocumentRow {
  id: string;
  type: string;
  status: string;
  fileName: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

/**
 * The documents that currently count for a provider — one per type.
 *
 * Superseded rows are excluded. They are the history, and the settings page is
 * answering "where do I stand", not "what have I ever sent". The full chain
 * stays in the table for the review queue and for anyone asking later what was
 * approved and when it changed.
 *
 * The storage key is deliberately absent. Nothing outside the Worker that
 * serves these files has any use for it, and a key on the wire is a key in a
 * log.
 */
export async function listProviderDocuments(
  providerId: string,
): Promise<ProviderDocumentRow[]> {
  const rows = await getDb()
    .select({
      id: providerDocument.id,
      type: providerDocument.type,
      status: providerDocument.status,
      fileName: providerDocument.fileName,
      uploadedAt: providerDocument.uploadedAt,
      reviewedAt: providerDocument.reviewedAt,
      rejectionReason: providerDocument.rejectionReason,
    })
    .from(providerDocument)
    .where(
      and(
        eq(providerDocument.providerId, providerId),
        ne(providerDocument.status, ProviderDocumentStatus.Superseded),
      ),
    )
    .orderBy(desc(providerDocument.uploadedAt));

  return rows.map((r) => ({
    ...r,
    uploadedAt: r.uploadedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  }));
}
