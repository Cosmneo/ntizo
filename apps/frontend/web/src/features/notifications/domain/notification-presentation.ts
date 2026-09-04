import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  CircleCheck,
  CircleDollarSign,
  FileWarning,
  Gavel,
  LifeBuoy,
  Mail,
  MessageSquare,
  Store,
  TriangleAlert,
  UserPlus,
} from "lucide-react";

/**
 * The icon a type draws with, and the i18n key its sentence lives under.
 *
 * A lookup with an explicit fallback rather than a `switch` over the enum: the
 * backend can raise a type this build has never heard of — a deploy skew, or a
 * type added after this bundle shipped — and a cell that throws on it would take
 * the whole inbox down over one unrecognised row. An unknown type renders as a
 * generic envelope with a generic sentence, which is the honest answer.
 */
const PRESENTATION: Record<string, { icon: LucideIcon; key: string }> = {
  WELCOME: { icon: Mail, key: "welcome" },
  PROVIDER_WORKSPACE_WELCOME: { icon: Store, key: "providerWorkspaceWelcome" },
  PROVIDER_VERIFIED: { icon: BadgeCheck, key: "providerVerified" },
  PROVIDER_DOCUMENTS_REQUIRED: { icon: FileWarning, key: "providerDocumentsRequired" },
  TEAM_INVITATION: { icon: UserPlus, key: "teamInvitation" },
  // Messaging and support. `NEW_MESSAGE` has been raised since messaging
  // phase 1 and rendered as the generic envelope all along — it belongs in
  // this map as much as the four below.
  NEW_MESSAGE: { icon: MessageSquare, key: "newMessage" },
  SUPPORT_REQUEST_OPENED: { icon: LifeBuoy, key: "supportRequestOpened" },
  SUPPORT_REQUEST_MESSAGE: { icon: LifeBuoy, key: "supportRequestMessage" },
  SUPPORT_REPLY: { icon: LifeBuoy, key: "supportReply" },
  SUPPORT_REQUEST_RESOLVED: { icon: CheckCircle2, key: "supportRequestResolved" },

  // Bookings.
  PROVIDER_BOOKING_RECEIVED: { icon: CalendarCheck, key: "providerBookingReceived" },
  BOOKING_ACCEPTED: { icon: CircleDollarSign, key: "bookingAccepted" },
  BOOKING_DECLINED: { icon: CalendarX, key: "bookingDeclined" },
  BOOKING_CONFIRMED: { icon: CalendarCheck, key: "bookingConfirmed" },
  PROVIDER_BOOKING_CONFIRMED: { icon: CalendarCheck, key: "providerBookingConfirmed" },
  PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER: { icon: CalendarX, key: "providerBookingCancelledByCustomer" },

  // Booking completion: mark done, keep open, close, dispute, resolve.
  PROVIDER_BOOKING_CLOSE_REMINDER: { icon: CalendarCheck, key: "providerBookingCloseReminder" },
  BOOKING_MARKED_DONE: { icon: CircleCheck, key: "bookingMarkedDone" },
  PROVIDER_BOOKING_AUTO_CLOSED: { icon: CalendarCheck, key: "providerBookingAutoClosed" },
  ADMIN_BOOKING_AUTO_CLOSED: { icon: CalendarCheck, key: "adminBookingAutoClosed" },
  BOOKING_DISPUTED: { icon: TriangleAlert, key: "bookingDisputed" },
  BOOKING_DISPUTE_RESOLVED: { icon: Gavel, key: "bookingDisputeResolved" },
};

const FALLBACK = { icon: Mail, key: "unknown" } as const;

export function presentationFor(type: string): { icon: LucideIcon; key: string } {
  return PRESENTATION[type] ?? FALLBACK;
}
