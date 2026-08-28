import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as attachmentRepository from "@/features/messaging/data/attachment.repository";
import { useAttachmentDownload } from "../use-attachment-download";

afterEach(() => vi.restoreAllMocks());

/**
 * `URL.createObjectURL` and `revokeObjectURL` do not exist in jsdom, so they
 * are supplied here rather than spied on. The returned url is unique per
 * call so a test can tell "revoked the one it created" from "revoked
 * something".
 */
function stubObjectUrls(): { created: string[]; revoked: string[] } {
  const created: string[] = [];
  const revoked: string[] = [];
  let n = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => {
      const url = `blob:test/${++n}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => void revoked.push(url),
  });
  return { created, revoked };
}

describe("useAttachmentDownload", () => {
  it("fetches nothing until something opens the attachment", () => {
    const fetchBlob = vi.spyOn(attachmentRepository, "fetchAttachmentBlob");
    stubObjectUrls();

    renderHook(() => useAttachmentDownload("a1"));

    expect(fetchBlob).not.toHaveBeenCalled();
  });

  /**
   * The leak this closes: every attachment somebody opens holds its blob for
   * the page's lifetime. A long conversation is exactly where several get
   * opened, and on a phone that is the person's memory being spent.
   */
  it("revokes the object url it created when the component goes away", async () => {
    vi.spyOn(attachmentRepository, "fetchAttachmentBlob").mockResolvedValue(
      new Blob(["x"], { type: "image/jpeg" }),
    );
    const urls = stubObjectUrls();

    const { result, unmount } = renderHook(() => useAttachmentDownload("a1"));
    await act(async () => void (await result.current.open()));
    await waitFor(() => expect(result.current.state).toBe("loaded"));

    expect(urls.created).toHaveLength(1);
    expect(urls.revoked).toEqual([]);

    unmount();

    expect(urls.revoked).toEqual(urls.created);
  });

  it("revokes nothing when nobody ever opened it", () => {
    const urls = stubObjectUrls();

    const { unmount } = renderHook(() => useAttachmentDownload("a1"));
    unmount();

    expect(urls.revoked).toEqual([]);
  });
});
