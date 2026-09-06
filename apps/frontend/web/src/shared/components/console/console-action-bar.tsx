import type { ComponentProps } from "react";
import { StickyActionBar } from "@ntizo/frontend-ui";
import { useOwnsBottomEdge } from "@/shared/lib/console-bottom-edge";

/**
 * `StickyActionBar`, and a claim on the bottom edge while it is mounted so
 * the tab bar stands down. Every console form's bottom bar is this one
 * (Phase 5 moves them over); nothing in the console renders
 * `StickyActionBar` directly.
 */
export function ConsoleActionBar(props: ComponentProps<typeof StickyActionBar>) {
  useOwnsBottomEdge();
  return <StickyActionBar {...props} />;
}
