import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { InboxScope } from "@/features/notifications/viewmodel/use-inbox";

// Field names are flat (`notificationMarkRead`, not `notification { markRead }`)
// — see the comment on `notificationQueries` for how the schema builder derives
// them, confirmed the same way: introspecting the running API's mutation type.
//
// `ok` is the string "true" here and in every `z.literal(true)` mutation in
// this codebase, so treat mutation success as resolution and failure as
// `onError` — never by inspecting `.ok` (follow-ups.md #45).
const MARK_ONE = `
  mutation MarkRead($input: NotificationMarkReadInput!) {
    notificationMarkRead(input: $input) { ok }
  }`;

const MARK_ONE_PROVIDER = `
  mutation MarkProviderRead($input: NotificationMarkProviderReadInput!) {
    notificationMarkProviderRead(input: $input) { ok }
  }`;

const MARK_ALL = `
  mutation MarkAllRead {
    notificationMarkAllRead(input: {}) { marked }
  }`;

const MARK_ALL_PROVIDER = `
  mutation MarkAllProviderRead($input: NotificationMarkAllProviderReadInput!) {
    notificationMarkAllProviderRead(input: $input) { marked }
  }`;

/**
 * Marking read, and refreshing what that changed.
 *
 * Invalidates the whole `["notifications"]` prefix rather than one page: the
 * badge and every loaded page of both inboxes are all downstream of this, and
 * enumerating them here would mean this file knowing every query key the
 * feature will ever have.
 *
 * No optimistic update. The row's only visible change is losing an unread dot,
 * a request that fails leaves the reader looking at a lie, and the round trip
 * is one query against a primary key.
 *
 * **A refused mark says so, as a toast.** An expired session, a workspace the
 * caller was removed from, a network that dropped — any of these used to
 * leave the button re-enabled and the rows unchanged, which reads as
 * "nothing happened" and cannot be told apart from a click that never
 * landed. A toast rather than a sentence on the page: the commonest mark is
 * the one a row fires as it opens its booking, and by the time that request
 * is refused the inbox has already been navigated away from. The `Toaster`
 * in `__root.tsx` outlives any page; state in this hook would not.
 */
export function useMarkRead(scope: InboxScope) {
  const qc = useQueryClient();
  const { t } = useTranslation("notifications");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const refused = () => toast.error(t("markError"));

  const one = useMutation({
    mutationFn: (notificationId: string) =>
      scope.kind === "mine"
        ? sessionGraphql(MARK_ONE, { input: { notificationId } })
        : sessionGraphql(MARK_ONE_PROVIDER, { input: { notificationId } }),
    onSuccess: invalidate,
    onError: refused,
  });

  const all = useMutation({
    mutationFn: () =>
      scope.kind === "mine"
        ? sessionGraphql(MARK_ALL, {})
        : sessionGraphql(MARK_ALL_PROVIDER, { input: { providerId: scope.providerId } }),
    onSuccess: invalidate,
    onError: refused,
  });

  return { markOne: one.mutate, markAll: all.mutate, isMarkingAll: all.isPending };
}
