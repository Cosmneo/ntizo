import { useCallback, useState } from "react";
import { AvatarUploadError, uploadMyAvatar } from "@/features/account/data/avatar.repository";

/** Server codes that deserve their own sentence. Anything else is generic. */
const KNOWN_CODES = new Set([
  "UNAUTHENTICATED",
  "TOO_LARGE",
  "UNACCEPTED_TYPE",
  "MEDIA_STORAGE_UNCONFIGURED",
]);

function errorKeyFor(err: unknown): string {
  if (err instanceof AvatarUploadError && KNOWN_CODES.has(err.code)) {
    return `mediaError.${err.code}`;
  }
  return "mediaError.GENERIC";
}

export interface AvatarUploadState {
  busy: boolean;
  /** A translation key under `account.mediaError.*`, or null. */
  errorKey: string | null;
  upload: (file: File) => Promise<{ key: string; url: string | null } | null>;
  clearError: () => void;
}

/**
 * Uploading one's own photo.
 *
 * Not a react-query mutation: there is no cache entry to invalidate here. The
 * upload produces a key, and it is *saving the form* that attaches it — a
 * separate, deliberate act, so a wrong photograph is discarded rather than
 * undone.
 */
export function useAvatarUpload(): AvatarUploadState {
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setErrorKey(null);
    try {
      return await uploadMyAvatar(file);
    } catch (err) {
      setErrorKey(errorKeyFor(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, errorKey, upload, clearError: useCallback(() => setErrorKey(null), []) };
}
