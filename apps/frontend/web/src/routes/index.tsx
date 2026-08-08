import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/features/landing/components/landing-page";

export const Route = createFileRoute("/")({
  ssr: true,
  component: LandingPage,
});
