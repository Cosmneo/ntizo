import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { renderWithRouter } from "@/test/render-with-router";
import { NotificationCell } from "@/features/notifications/ui/notification-cell";

// The clock a row prints is the reader's local one — pinned for the same
// reason `inbox-groups.test.ts` pins it.
beforeAll(() => {
  vi.stubEnv("TZ", "Africa/Maputo");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const TODAY = "2026-09-07T10:00:00.000Z";
const CUSTOMER = { kind: "customer" } as const;

function booking(over: Partial<NotificationDTO> = {}): NotificationDTO {
  return {
    id: "n1",
    type: "BOOKING_CONFIRMED",
    payload: {
      bookingId: "bk-1",
      serviceName: "Limpeza profunda",
      providerName: "Clean & Fresh",
      startsAt: "2026-09-09T07:00:00.000Z",
    },
    createdAt: "2026-09-07T06:33:00.000Z", // 08:33 in Maputo
    read: false,
    ...over,
  };
}

function renderCell(notification: NotificationDTO, group: "today" | "earlier" = "today") {
  const onMarkRead = vi.fn();
  const rendered = renderWithRouter(
    <ul>
      <NotificationCell
        notification={notification}
        group={group}
        zone={CUSTOMER}
        todayIso={TODAY}
        onMarkRead={onMarkRead}
      />
    </ul>,
  );
  return rendered.then((r) => ({ ...r, onMarkRead }));
}

describe("NotificationCell", () => {
  it("is a link to the booking it is about", async () => {
    await renderCell(booking());
    const link = screen.getByRole("link", { name: /your booking is confirmed/i });
    expect(link).toHaveAttribute("href", "/bookings/bk-1");
  });

  it("says which booking, on a second line", async () => {
    await renderCell(booking());
    expect(screen.getByText(/Limpeza profunda · Clean & Fresh/)).toBeInTheDocument();
  });

  it("marks an unread row read when it is opened", async () => {
    const { onMarkRead } = await renderCell(booking());
    await userEvent.click(screen.getByRole("link", { name: /your booking is confirmed/i }));
    expect(onMarkRead).toHaveBeenCalledWith("n1");
  });

  it("does not mark a row the reader opened in another tab", async () => {
    // A cmd/ctrl-click hands the target to a new tab; this tab has not shown
    // the reader anything, so the row must stay unread here.
    const { onMarkRead } = await renderCell(booking());
    const link = screen.getByRole("link", { name: /your booking is confirmed/i });
    // One `setup()` instance, so the held key is still down when the click
    // lands; the module-level `userEvent` forgets keyboard state between calls.
    const user = userEvent.setup();
    await user.keyboard("{Meta>}");
    await user.click(link);
    await user.keyboard("{/Meta}");
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("does not mark a row that is already read", async () => {
    const { onMarkRead } = await renderCell(booking({ read: true }));
    await userEvent.click(screen.getByRole("link", { name: /your booking is confirmed/i }));
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("is a button when there is nowhere to go, and still marks itself read", async () => {
    const { onMarkRead } = await renderCell(booking({ type: "WELCOME", payload: {} }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /welcome to ntizo/i }));
    expect(onMarkRead).toHaveBeenCalledWith("n1");
  });

  it("offers to mark an unread row read without opening it", async () => {
    const { onMarkRead, router } = await renderCell(booking());
    await userEvent.click(screen.getByRole("button", { name: /mark as read/i }));
    expect(onMarkRead).toHaveBeenCalledWith("n1");
    // The control sits beside the link, not inside it: clearing a row must
    // not also open the booking.
    expect(router.state.location.pathname).toBe("/");
  });

  it("offers nothing to mark on a row already read", async () => {
    await renderCell(booking({ read: true }));
    expect(screen.queryByRole("button", { name: /mark as read/i })).not.toBeInTheDocument();
  });

  it("invites the reader to open the conversation a message is about", async () => {
    await renderCell(booking({ type: "NEW_MESSAGE", payload: { threadId: "th-1" } }));
    expect(screen.getByRole("link", { name: /you have a new message/i })).toHaveAttribute(
      "href",
      "/messages?thread=th-1",
    );
    expect(screen.getByText(/open the conversation/i)).toBeInTheDocument();
  });

  it("shows the clock under today's heading", async () => {
    await renderCell(booking(), "today");
    expect(screen.getByText(/08:33/)).toHaveAttribute("datetime", "2026-09-07T06:33:00.000Z");
  });

  it("shows the day under the earlier heading", async () => {
    await renderCell(booking({ createdAt: "2026-09-03T06:33:00.000Z" }), "earlier");
    expect(screen.getByText(/Sep 3/)).toBeInTheDocument();
    expect(screen.queryByText(/08:33/)).not.toBeInTheDocument();
  });
});
