import { createFileRoute } from "@tanstack/react-router";
import { PaymentMethodsPage } from "@/features/account/ui/section-pages";

export const Route = createFileRoute("/_customer/account/payment-methods")({
  component: PaymentMethodsPage,
});
