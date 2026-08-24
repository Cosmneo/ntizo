import { and, desc, eq, ne } from "drizzle-orm";
import {
  ProviderDocumentStatus,
  replacementNeedsReview,
  type ProviderDocumentType,
} from "@ntizo/shared";
import { getDb } from "../../../../better-auth/infrastructure/client/drizzle";
import { provider, providerDocument } from "../database/provider/schemas";

export interface RecordedUpload {
  id: string;
  status: ProviderDocumentStatus;
  /** True when this replaced something a reviewer had already accepted. */
  reopensReview: boolean;
}

/**
 * Writes the row for a document that has just landed in storage.
 *
 * Three statements that must hold together, so they run in one transaction:
 * the previous document of this type becomes `superseded`, the new one is
 * inserted `pending` and pointing back at it, and — only if what it replaced
 * had been *accepted* — the provider is flagged for re-verification.
 *
 * Nothing here can promote a document. A new upload is `pending` whatever the
 * provider's standing, which is the property the whole design turns on: an
 * approval belongs to the bytes a reviewer looked at, and cannot follow the
 * document type onto bytes that arrived later.
 *
 * Called after the object is in the bucket, not before. A row pointing at a
 * key that does not exist is a broken link in the admin queue; an object with
 * no row is an orphan nobody sees, which is the cheaper of the two failures.
 */
export async function recordDocumentUpload(input: {
  providerId: string;
  type: ProviderDocumentType;
  storageKey: string;
  fileName: string | null;
  contentType: string;
  uploadedByUserId: string;
}): Promise<RecordedUpload> {
  return getDb().transaction(async (tx) => {
    // The one that currently counts: newest of this type that has not already
    // been replaced. Ordered explicitly — "the last row inserted" is not a
    // thing Postgres promises.
    const [previous] = await tx
      .select({ id: providerDocument.id, status: providerDocument.status })
      .from(providerDocument)
      .where(
        and(
          eq(providerDocument.providerId, input.providerId),
          eq(providerDocument.type, input.type),
          ne(providerDocument.status, ProviderDocumentStatus.Superseded),
        ),
      )
      .orderBy(desc(providerDocument.uploadedAt))
      .limit(1);

    const reopensReview = replacementNeedsReview(
      previous?.status as ProviderDocumentStatus | undefined,
    );

    if (previous) {
      // Superseded, never deleted and never edited beyond this one field. The
      // reviewer's decision and the key they saw stay on the row.
      await tx
        .update(providerDocument)
        .set({ status: ProviderDocumentStatus.Superseded })
        .where(eq(providerDocument.id, previous.id));
    }

    const [inserted] = await tx
      .insert(providerDocument)
      .values({
        providerId: input.providerId,
        type: input.type,
        storageKey: input.storageKey,
        fileName: input.fileName,
        contentType: input.contentType,
        uploadedByUserId: input.uploadedByUserId,
        status: ProviderDocumentStatus.Pending,
        ...(previous ? { supersedesId: previous.id } : {}),
      })
      .returning({ id: providerDocument.id });

    if (reopensReview) {
      await tx
        .update(provider)
        .set({ reverificationRequestedAt: new Date() })
        .where(eq(provider.id, input.providerId));
    }

    return {
      id: inserted!.id,
      status: ProviderDocumentStatus.Pending,
      reopensReview,
    };
  });
}
