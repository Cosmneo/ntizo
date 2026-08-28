import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAttachmentBlob } from "@/features/messaging/data/attachment.repository";

export type AttachmentOpenState = "idle" | "loading" | "loaded" | "error";

/**
 * One already-sent attachment's bytes, fetched only once something asks for
 * them.
 *
 * The seam `AttachmentList` (a `ui/` file) needs to reach `data/` through:
 * `boundaries/dependencies` forbids a `ui/` file from importing `data/`
 * directly (the same rule `customer-messages-page.test.tsx`'s own doc
 * comment already documents for a test file), the same way every other
 * component in this feature reaches a repository through a `viewmodel/`
 * hook rather than calling `sessionGraphql`/`fetch` itself.
 *
 * `open` is idempotent — a second call while already `"loading"` or once
 * already `"loaded"` returns the same promise's eventual URL rather than
 * fetching the same bytes twice. Nothing here calls `open` on its own; a
 * caller decides when, which is what makes "an attachment's bytes are
 * fetched only once somebody opens it" true. See `AttachmentList`'s own doc
 * comment for why that matters.
 *
 * The object URL is revoked on unmount. Without that, every attachment
 * somebody opens holds its blob in memory until the page is reloaded, and a
 * long conversation is exactly where several get opened. The same pattern
 * is in `features/admin/categories/ui/category-form.tsx`.
 */
export function useAttachmentDownload(attachmentId: string) {
  const [state, setState] = useState<AttachmentOpenState>("idle");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // A ref as well as state: the unmount cleanup must see the CURRENT url, and
  // an effect closing over the state value would capture whatever it was when
  // that effect last ran.
  const created = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (created.current) URL.revokeObjectURL(created.current);
    },
    [],
  );

  const open = useCallback(async (): Promise<string | null> => {
    if (objectUrl) return objectUrl;
    if (state === "loading") return null;

    setState("loading");
    try {
      const blob = await fetchAttachmentBlob(attachmentId);
      const url = URL.createObjectURL(blob);
      created.current = url;
      setObjectUrl(url);
      setState("loaded");
      return url;
    } catch {
      setState("error");
      return null;
    }
  }, [attachmentId, objectUrl, state]);

  return { state, objectUrl, open };
}
