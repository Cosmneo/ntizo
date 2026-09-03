import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { audienceForPath } from "@/features/help-center/domain/help-audience";
import { useHelpCenter } from "@/features/help-center/viewmodel/use-help-center";
import { useSupportRequests } from "@/features/help-center/viewmodel/use-support-requests";
import { useOpenSupportRequest } from "@/features/help-center/viewmodel/use-open-support-request";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { showsHelpLauncher } from "@/shared/lib/zones";
import { HelpLauncher } from "@/features/help-center/ui/help-launcher";
import { HelpPanel } from "@/features/help-center/ui/help-panel";
import { HelpHome } from "@/features/help-center/ui/help-home";
import { HelpFaq } from "@/features/help-center/ui/help-faq";
import { HelpRequests } from "@/features/help-center/ui/help-requests";
import { HelpNewRequest } from "@/features/help-center/ui/help-new-request";
import { HelpConversation } from "@/features/help-center/ui/help-conversation";
import { HelpSignInPrompt } from "@/features/help-center/ui/help-sign-in-prompt";
import type { AttachmentDescriptor } from "@/features/messaging/domain/types";

/**
 * The Help Center, mounted once at the root.
 *
 * The launcher hides where `showsHelpLauncher` says so, but the panel stays
 * mounted regardless: the footer's "Falar com o suporte" and a booking's
 * "need help" both open it from pages the launcher is absent from, and a
 * panel that unmounted with its button would leave those links doing
 * nothing.
 */
export function HelpCenter() {
  const { t, i18n } = useTranslation("help");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const help = useHelpCenter();
  const { data: me } = useCurrentUser();

  const { audience } = audienceForPath(pathname);
  // Only fetches on a provider-audience page: this component is mounted at
  // the root, so an unconditional call here would run an authenticated
  // "which workspace" query for every visitor on every page, signed out and
  // on the public landing page included. See `useActiveProvider`'s own doc
  // comment for why `enabled` exists.
  const {
    activeProvider,
    loading: workspaceLoading,
    refresh: refreshWorkspace,
  } = useActiveProvider(audience === "provider");
  const providerId = audience === "provider" ? (activeProvider?.id ?? null) : null;
  const signedIn = Boolean(me);

  /**
   * On a provider page with no workspace id yet — `providers.mine` is either
   * still in flight or has failed. Both used to look identical to the rest
   * of this component, and both were wrong in their own way: a request sent
   * without `providerId` reaches the backend as a bare
   * `{ audience: "provider" }` and comes back `SUPPORT_NOT_A_MEMBER`, which
   * renders as "You don't belong to this provider" to a member standing on
   * their own workspace's page; and "my requests" sat on a query that
   * `enabled: false` keeps `isPending` forever, so it showed a skeleton that
   * never resolved. Named once here and used by both screens below.
   *
   * `!workspaceLoading` is the whole failure test, deliberately: a
   * `providers.mine` that errors settles with `isLoading` false and no
   * data, and one that is retrying keeps it true — so a second branch on
   * the query's `error` could never disagree with this one, and it covers
   * the reader-with-no-workspace case too.
   */
  const workspaceUnknown = audience === "provider" && providerId === null;
  const workspaceFailed = workspaceUnknown && !workspaceLoading;

  /**
   * When the request list is worth fetching at all.
   *
   * Signed in, obviously — an anonymous visitor's inbox query can only come
   * back `UNAUTHENTICATED`, and this component is mounted on every page. And
   * only where the panel is reachable: `showsHelpLauncher` is false on
   * `/admin`, `/book` and the booking confirmation, where nothing renders
   * the unread badge, so there the list waits until somebody actually opens
   * the panel (the footer link and a booking's "need help" can, from pages
   * with no launcher). Everywhere the launcher does show, the badge needs
   * the count whether the panel is open or not.
   */
  const wantsRequests = signedIn && (help.open || showsHelpLauncher(pathname));
  const { requests, loading, errorCode } = useSupportRequests(audience, providerId, wantsRequests);
  const { openRequest, opening, errorCode: openErrorCode } = useOpenSupportRequest();

  const unreadCount = signedIn
    ? requests.reduce((total, request) => total + request.unreadCount, 0)
    : 0;
  const selected = requests.find((request) => request.id === help.selectedThreadId) ?? null;

  const submit = async (subject: string, body: string, attachments: AttachmentDescriptor[]) => {
    // The composer is already disabled while this holds (see `blocked`
    // below); this is the second lock, so a future caller of `onSubmit`
    // cannot file a provider request against a workspace nobody knows.
    if (workspaceUnknown) return;
    const threadId = await openRequest({
      audience,
      ...(providerId ? { providerId } : {}),
      subject,
      body,
      ...(help.prefill ? { bookingId: help.prefill.bookingId } : {}),
      attachments,
    });
    if (threadId) help.openThread(threadId);
  };

  return (
    <>
      {showsHelpLauncher(pathname) && (
        <HelpLauncher unreadCount={unreadCount} onOpen={() => help.openPanel()} />
      )}

      <HelpPanel
        open={help.open}
        onOpenChange={(next) => (next ? help.openPanel() : help.close())}
        canGoBack={help.screen !== "home"}
        onBack={help.back}
      >
        {help.screen === "home" && <HelpHome signedIn={signedIn} unreadCount={unreadCount} />}
        {help.screen === "faq" && (
          <HelpFaq query={help.query} onAskUs={() => help.composeNew()} showSearch />
        )}
        {help.screen === "requests" &&
          (workspaceFailed ? (
            // Not `HelpRequests` with `loading`: the list query behind it is
            // `enabled: false` without a workspace id, and a disabled query
            // stays `isPending` for as long as the panel is open — a
            // skeleton with no end and no explanation. Say what went wrong,
            // and offer the one thing that can fix it.
            <div className="grid justify-items-start gap-2 p-4">
              <p className="type-body text-[var(--color-destructive)]">{t("workspaceError")}</p>
              <button
                type="button"
                onClick={() => void refreshWorkspace()}
                className="type-body-medium text-[var(--color-primary)] hover:underline"
              >
                {t("workspaceRetry")}
              </button>
            </div>
          ) : (
            <HelpRequests
              requests={requests}
              loading={loading}
              errorCode={errorCode}
              locale={locale}
              onOpen={help.openThread}
            />
          ))}
        {help.screen === "new" &&
          // A signed-out reader can reach "new" from more than one button
          // (a popular question, a no-match search, "send a message"), and
          // none of those is allowed to end in a form: the spec's signed-out
          // branch is the FAQ and a way in, never a form. Gated here, once,
          // rather than in every caller of `composeNew`, so no future button
          // can reopen the gap by forgetting to check.
          (signedIn ? (
            <HelpNewRequest
              prefill={help.prefill}
              onClearPrefill={() => help.composeNew()}
              onSubmit={(subject, body, attachments) => void submit(subject, body, attachments)}
              submitting={opening}
              errorCode={openErrorCode}
              {...(audience === "provider" && activeProvider
                ? { audienceLabel: t("audienceProvider", { provider: activeProvider.name }) }
                : {})}
              {...(workspaceUnknown
                ? {
                    blocked: {
                      message: workspaceFailed ? t("workspaceError") : t("workspaceLoading"),
                      failed: workspaceFailed,
                    },
                  }
                : {})}
            />
          ) : (
            <div className="p-4">
              <HelpSignInPrompt />
            </div>
          ))}
        {help.screen === "conversation" && <HelpConversation request={selected} />}
      </HelpPanel>
    </>
  );
}
