import { useCallback, useState } from "react";
import type { ProviderDocumentType } from "@ntizo/shared";
import {
  DocumentUploadError,
  uploadProviderDocument,
  type UploadedDocument,
} from "../data/document.repository";

/** Server codes that deserve their own sentence. Anything else is generic. */
const KNOWN_CODES = new Set([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "TOO_LARGE",
  "UNACCEPTED_TYPE",
  "DOCUMENT_STORAGE_UNCONFIGURED",
]);

export function useDocumentUpload(providerId: string | undefined) {
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const send = useCallback(
    async (
      type: ProviderDocumentType,
      file: File,
    ): Promise<UploadedDocument | null> => {
      if (!providerId) return null;
      setBusy(true);
      setErrorKey(null);
      try {
        return await uploadProviderDocument(providerId, type, file);
      } catch (err) {
        setErrorKey(
          err instanceof DocumentUploadError && KNOWN_CODES.has(err.code)
            ? `documentError.${err.code}`
            : "documentError.GENERIC",
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [providerId],
  );

  return { busy, errorKey, send };
}
