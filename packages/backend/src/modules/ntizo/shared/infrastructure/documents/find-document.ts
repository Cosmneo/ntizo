import { eq } from "drizzle-orm";
import { getDb } from "../../../../better-auth/infrastructure/client/drizzle";
import { providerDocument } from "../database/provider/schemas";

export interface StoredDocument {
  id: string;
  providerId: string;
  storageKey: string;
  fileName: string | null;
  contentType: string | null;
}

/**
 * One document, by its id.
 *
 * By id and not by storage key, because the id is what the reviewer's screen
 * has and the key is what it must never be given: a key in the browser is the
 * object's address, and these objects are identity cards.
 *
 * Returns the `providerId` so the caller can decide whether this person may
 * look — this function answers "what is it", never "may you have it".
 */
export async function findDocumentById(
  documentId: string,
): Promise<StoredDocument | null> {
  const [row] = await getDb()
    .select({
      id: providerDocument.id,
      providerId: providerDocument.providerId,
      storageKey: providerDocument.storageKey,
      fileName: providerDocument.fileName,
      contentType: providerDocument.contentType,
    })
    .from(providerDocument)
    .where(eq(providerDocument.id, documentId))
    .limit(1);
  return row ?? null;
}
