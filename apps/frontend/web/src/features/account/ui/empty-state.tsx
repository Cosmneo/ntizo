import type { ReactNode } from "react";

/**
 * What a page shows before the feature behind it exists.
 *
 * Says plainly that there is nothing yet, rather than showing a spinner that
 * never resolves or a fake row. The page is real and routable — it is the
 * content that is still to come.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] px-6 py-16 text-center">
      <span className="rounded-full bg-[var(--color-muted)] p-3 text-[var(--color-muted-foreground)]">
        {icon}
      </span>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
        {body}
      </p>
      {action}
    </div>
  );
}
