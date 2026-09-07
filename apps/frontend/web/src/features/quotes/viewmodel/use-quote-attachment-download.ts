import { useCallback, useState } from "react";
import { fetchQuoteAttachmentBlob } from "@/features/quotes/data/quote-attachment.repository";
import type { QuoteAttachmentDTO } from "@/features/quotes/data/quote.repository";

/**
 * Saving one attachment to the reader's disk.
 *
 * The bytes are fetched rather than linked, because the route needs the
 * session cookie and an `<a href>` to a 403 would open a blank tab instead
 * of saying anything. The object URL is revoked on the next tick — long
 * enough for the click to have been dispatched, short enough that a page
 * full of attachments does not hold every blob it ever showed.
 */
export function useQuoteAttachmentDownload() {
  const [failedId, setFailedId] = useState<string | null>(null);

  const download = useCallback((attachment: QuoteAttachmentDTO) => {
    setFailedId(null);
    void (async () => {
      try {
        const blob = await fetchQuoteAttachmentBlob(attachment.id);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = attachment.fileName;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      } catch {
        setFailedId(attachment.id);
      }
    })();
  }, []);

  return { download, failedId };
}
