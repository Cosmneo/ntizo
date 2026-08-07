import type { BookingPath, BookingStatus } from "../../../enums";

// Cross-BC contract: a compact booking projection used by
// notification / review / payment bounded contexts.
export interface BookingSummaryContract {
  id: string;
  customerId: string;
  providerId: string;
  path: BookingPath;
  status: BookingStatus;
  totalAmount: number;
  currency: string;
}
