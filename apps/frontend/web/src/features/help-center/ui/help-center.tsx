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
  const { i18n } = useTranslation("help");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const help = useHelpCenter();
  const { data: me } = useCurrentUser();
  const { activeProvider } = useActiveProvider();

  const { audience } = audienceForPath(pathname);
  const providerId = audience === "provider" ? (activeProvider?.id ?? null) : null;
  const signedIn = Boolean(me);

  const { requests, loading, errorCode } = useSupportRequests(audience, providerId);
  const { openRequest, opening, errorCode: openErrorCode } = useOpenSupportRequest();

  const unreadCount = signedIn
    ? requests.reduce((total, request) => total + request.unreadCount, 0)
    : 0;
  const selected = requests.find((request) => request.id === help.selectedThreadId) ?? null;

  const submit = async (subject: string, body: string, attachments: AttachmentDescriptor[]) => {
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
        {help.screen === "faq" && <HelpFaq query={help.query} onAskUs={() => help.composeNew()} />}
        {help.screen === "requests" && (
          <HelpRequests
            requests={requests}
            loading={loading}
            errorCode={errorCode}
            locale={locale}
            onOpen={help.openThread}
          />
        )}
        {help.screen === "new" && (
          <HelpNewRequest
            prefill={help.prefill}
            onClearPrefill={() => help.composeNew()}
            onSubmit={(subject, body, attachments) => void submit(subject, body, attachments)}
            submitting={opening}
            errorCode={openErrorCode}
            {...(audience === "provider" && activeProvider
              ? { audienceLabel: i18n.t("audienceProvider", { ns: "help", provider: activeProvider.name }) }
              : {})}
          />
        )}
        {help.screen === "conversation" && <HelpConversation request={selected} />}
      </HelpPanel>
    </>
  );
}
