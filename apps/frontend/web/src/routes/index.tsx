import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => <div data-testid="home-placeholder">Ntizo web — scaffold OK</div>,
});
