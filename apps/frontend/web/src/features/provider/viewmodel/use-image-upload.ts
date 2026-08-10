import { useCallback, useState } from "react";
import {
  MediaUploadError,
  uploadProviderImage,
  type MediaKind,
} from "../data/media.repository";

/** Keys, not URLs, are what gets saved — the server composes URLs at read time. */
export interface UploadResult {
  key: string;
  url: string | null;
}

export interface ImageUploadState {
  busy: boolean;
  /** A translation key under `provider.mediaError.*`, or null. */
  errorKey: string | null;
  upload: (kind: MediaKind, file: File) => Promise<UploadResult | null>;
  uploadMany: (kind: MediaKind, files: File[]) => Promise<UploadResult[]>;
  clearError: () => void;
}

/** Server codes that deserve their own sentence. Anything else is generic. */
const KNOWN_CODES = new Set([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "TOO_LARGE",
  "UNACCEPTED_TYPE",
  "MEDIA_STORAGE_UNCONFIGURED",
]);

function errorKeyFor(err: unknown): string {
  if (err instanceof MediaUploadError && KNOWN_CODES.has(err.code)) {
    return `mediaError.${err.code}`;
  }
  return "mediaError.GENERIC";
}

/**
 * Uploading images for one provider.
 *
 * Not a react-query mutation: there is no cache entry to invalidate here. The
 * upload produces a key, and it is the *save* that attaches it — which is a
 * separate, deliberate act, so a provider who picks the wrong photograph can
 * discard rather than undo.
 */
export function useImageUpload(providerId: string | undefined): ImageUploadState {
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const upload = useCallback(
    async (kind: MediaKind, file: File): Promise<UploadResult | null> => {
      if (!providerId) return null;
      setBusy(true);
      setErrorKey(null);
      try {
        return await uploadProviderImage(providerId, kind, file);
      } catch (err) {
        setErrorKey(errorKeyFor(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [providerId],
  );

  const uploadMany = useCallback(
    async (kind: MediaKind, files: File[]): Promise<UploadResult[]> => {
      if (!providerId || files.length === 0) return [];
      setBusy(true);
      setErrorKey(null);
      const done: UploadResult[] = [];
      try {
        // Sequential, not `Promise.all`. Five 5 MB uploads racing on a phone
        // connection is how you get five timeouts instead of two photographs;
        // and a partial failure here still keeps whatever already succeeded.
        for (const file of files) {
          done.push(await uploadProviderImage(providerId, kind, file));
        }
      } catch (err) {
        setErrorKey(errorKeyFor(err));
      } finally {
        setBusy(false);
      }
      return done;
    },
    [providerId],
  );

  return {
    busy,
    errorKey,
    upload,
    uploadMany,
    clearError: useCallback(() => setErrorKey(null), []),
  };
}
