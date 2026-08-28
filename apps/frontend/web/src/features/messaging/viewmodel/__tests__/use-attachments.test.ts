import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MAX_ATTACHMENTS } from "@/features/messaging/domain/types";
import * as attachmentRepository from "@/features/messaging/data/attachment.repository";
import { useAttachments } from "../use-attachments";

afterEach(() => vi.restoreAllMocks());

function fileNamed(name: string, type = "image/jpeg"): File {
  return new File(["x"], name, { type });
}

describe("useAttachments: picking", () => {
  it("adds a clean file with no error", () => {
    const { result } = renderHook(() => useAttachments());

    act(() => result.current.add(fileNamed("foto.jpg")));

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0]?.errorKey).toBeNull();
  });

  it("flags an unaccepted file type", () => {
    const { result } = renderHook(() => useAttachments());

    act(() => result.current.add(fileNamed("notes.docx", "application/msword")));

    expect(result.current.files[0]?.errorKey).toBe("attachmentError.UNACCEPTED_TYPE");
  });

  it("flags a file over the byte cap", () => {
    const { result } = renderHook(() => useAttachments());
    const big = fileNamed("big.jpg");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });

    act(() => result.current.add(big));

    expect(result.current.files[0]?.errorKey).toBe("attachmentError.TOO_LARGE");
  });

  it("flags a file whose name carries a phone number — the same detector the body uses", () => {
    const { result } = renderHook(() => useAttachments());

    act(() => result.current.add(fileNamed("liga-me-841234567.jpg")));

    expect(result.current.files[0]?.errorKey).toBe("attachmentError.CONTACT_IN_FILE_NAME");
  });

  it("ignores a pick past MAX_ATTACHMENTS — the picker's own second line of defence", () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      for (let i = 0; i < MAX_ATTACHMENTS + 2; i++) result.current.add(fileNamed(`f${i}.jpg`));
    });

    expect(result.current.files).toHaveLength(MAX_ATTACHMENTS);
  });

  it("removes a picked file by id", () => {
    const { result } = renderHook(() => useAttachments());
    act(() => result.current.add(fileNamed("foto.jpg")));
    const id = result.current.files[0]!.id;

    act(() => result.current.remove(id));

    expect(result.current.files).toHaveLength(0);
  });

  it("clears every picked file on reset", () => {
    const { result } = renderHook(() => useAttachments());
    act(() => {
      result.current.add(fileNamed("a.jpg"));
      result.current.add(fileNamed("b.jpg"));
    });

    act(() => result.current.reset());

    expect(result.current.files).toHaveLength(0);
  });
});

describe("useAttachments: uploadAll", () => {
  it("resolves an empty list when nothing was picked", async () => {
    const { result } = renderHook(() => useAttachments());

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current.uploadAll();
    });

    expect(uploaded).toEqual([]);
  });

  it("never calls the network when a picked file already has a client-side error", async () => {
    const spy = vi.spyOn(attachmentRepository, "uploadAttachment");
    const { result } = renderHook(() => useAttachments());
    act(() => result.current.add(fileNamed("liga-me-841234567.jpg")));

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current.uploadAll();
    });

    expect(uploaded).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("uploads every clean file in order and returns storageKey-only descriptors, never fileName", async () => {
    // `fileName` is deliberately absent from what `uploadAll` returns — see
    // `AttachmentDescriptor`'s own doc comment. The upload response
    // (`uploadAttachment`'s resolved value) still carries `fileName`, for
    // local display before send; this proves it is not forwarded.
    vi.spyOn(attachmentRepository, "uploadAttachment").mockImplementation(async (file: File) => ({
      storageKey: `attachment/u1/${file.name}`,
      fileName: file.name,
      contentType: "image/jpeg",
      sizeBytes: 3,
    }));

    const { result } = renderHook(() => useAttachments());
    act(() => {
      result.current.add(fileNamed("a.jpg"));
      result.current.add(fileNamed("b.jpg"));
    });

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current.uploadAll();
    });

    expect(uploaded).toEqual([
      { storageKey: "attachment/u1/a.jpg" },
      { storageKey: "attachment/u1/b.jpg" },
    ]);
  });

  it("stops at the first server failure, writes that file's own error, and resolves null", async () => {
    vi.spyOn(attachmentRepository, "uploadAttachment").mockRejectedValue(
      new attachmentRepository.AttachmentUploadError("ATTACHMENT_STORAGE_UNCONFIGURED"),
    );

    const { result } = renderHook(() => useAttachments());
    act(() => result.current.add(fileNamed("a.jpg")));

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current.uploadAll();
    });

    expect(uploaded).toBeNull();
    await waitFor(() =>
      expect(result.current.files[0]?.errorKey).toBe(
        "attachmentError.ATTACHMENT_STORAGE_UNCONFIGURED",
      ),
    );
  });

  it("reports uploading true only while the upload is in flight", async () => {
    let resolveUpload: (() => void) | undefined;
    vi.spyOn(attachmentRepository, "uploadAttachment").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = () =>
            resolve({
              storageKey: "attachment/u1/a.jpg",
              fileName: "a.jpg",
              contentType: "image/jpeg",
              sizeBytes: 3,
            });
        }),
    );

    const { result } = renderHook(() => useAttachments());
    act(() => result.current.add(fileNamed("a.jpg")));

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.uploadAll();
    });

    await waitFor(() => expect(result.current.uploading).toBe(true));

    await act(async () => {
      resolveUpload?.();
      await pending;
    });

    expect(result.current.uploading).toBe(false);
  });
});
