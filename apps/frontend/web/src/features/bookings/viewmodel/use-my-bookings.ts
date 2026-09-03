import { useQuery } from "@tanstack/react-query";
import {
  myBookingQueries,
  type MyBookingsPageInput,
} from "../data/booking.repository";

export function useMyBookings(input: MyBookingsPageInput) {
  return useQuery(myBookingQueries.page(input));
}

export function useMyBooking(bookingId: string) {
  return useQuery(myBookingQueries.detail(bookingId));
}
