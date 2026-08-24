import { LazyEmailServiceAdapter } from "../../../../../shared/infrastructure/email";
import { DrizzleNotificationRepository } from "../infrastructure/repositories/drizzle/notification.repository";
import { DrizzleNotificationDeliveryRepository } from "../infrastructure/repositories/drizzle/notification-delivery.repository";
import { DrizzleEmailSuppressionRepository } from "../infrastructure/repositories/drizzle/email-suppression.repository";
import { DrizzleProviderMemberReader } from "../infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter";
import { DrizzleProviderNameReader } from "../infrastructure/outbound-adapters/cross-bc/provider-name-reader.adapter";
import { DrizzleRecipientReader } from "../infrastructure/outbound-adapters/cross-bc/recipient-reader.adapter";
import { DrizzleUserByEmailReader } from "../infrastructure/outbound-adapters/cross-bc/user-by-email-reader.adapter";
import { LocalTemplateRenderer } from "../infrastructure/outbound-adapters/template-renderer.adapter";
import { DeferredNotificationDelivery } from "../infrastructure/inbound-adapters/deferred-notification-delivery.adapter";
import { DeliverNotificationInternalCommand } from "../app/use-cases/deliver-notification.internal.command";
import { HandleResendWebhookInternalCommand } from "../app/use-cases/handle-resend-webhook.internal.command";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";
import {
  MarkAllNotificationsReadCommand,
  MarkNotificationReadCommand,
} from "../app/use-cases/mark-read.command";

export function bootstrapNotification() {
  const notificationRepository = new DrizzleNotificationRepository();
  const deliveryRepository = new DrizzleNotificationDeliveryRepository();
  const suppressionRepository = new DrizzleEmailSuppressionRepository();
  const memberReader = new DrizzleProviderMemberReader();
  const userByEmailReader = new DrizzleUserByEmailReader();
  const providerNameReader = new DrizzleProviderNameReader();
  const recipientReader = new DrizzleRecipientReader();
  const templateRenderer = new LocalTemplateRenderer();
  // The lazy adapter, not a concrete one: which sender to use depends on
  // RESEND_API_KEY and STAGE, and those are per-request bindings this
  // module-scope bootstrap cannot read yet.
  const emailService = new LazyEmailServiceAdapter();

  const deliverNotification = new DeliverNotificationInternalCommand(
    deliveryRepository,
    suppressionRepository,
    recipientReader,
    templateRenderer,
    emailService,
  );

  return {
    adapters: { notificationRepository, memberReader, userByEmailReader, providerNameReader },
    useCases: {
      markNotificationRead: new MarkNotificationReadCommand(notificationRepository),
      markAllNotificationsRead: new MarkAllNotificationsReadCommand(
        notificationRepository,
        memberReader,
      ),
      internal: {
        // Raising gets the *deferred* deliverer. Composed here because this is
        // the only place allowed to decide when work runs: the command asks
        // for delivery, the wrapper decides it happens after the response.
        raiseNotification: new RaiseNotificationInternalCommand(
          notificationRepository,
          new DeferredNotificationDelivery(deliverNotification),
        ),
        // The undecorated command, exposed for a caller that must know what
        // happened — it returns the delivery ids and can be awaited. Anything
        // reached from a request handler should prefer the deferred path.
        deliverNotification,
        // What Resend's bounce and complaint callbacks mean for an address.
        //
        // Two repositories, and the order is the constructor's: suppressions
        // first, because writing one is this command's only load-bearing
        // effect; deliveries second, for the best-effort lookup that folds
        // "which notification was this?" into the suppression's `detail`.
        // Handing it only the suppressions — the obvious reading of "it
        // suppresses addresses" — would leave every suppression recording the
        // raw provider payload and nothing about what we had sent.
        //
        // NOT deferred, unlike `raiseNotification`. The webhook route's 200
        // is a promise to Resend that the event was handled; scheduling the
        // work past the response would make that promise before the write,
        // and a failure after it would be answered with a 200 and never
        // retried.
        handleResendWebhook: new HandleResendWebhookInternalCommand(
          suppressionRepository,
          deliveryRepository,
        ),
      },
    },
  };
}

export type NotificationBootstrap = ReturnType<typeof bootstrapNotification>;
