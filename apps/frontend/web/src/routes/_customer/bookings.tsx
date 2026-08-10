import { createFileRoute } from "@tanstack/react-router";
import { BookingsPage } from "@/features/account/ui/placeholder-pages";

export const Route = createFileRoute("/_customer/bookings")({
  component: BookingsPage,
});
