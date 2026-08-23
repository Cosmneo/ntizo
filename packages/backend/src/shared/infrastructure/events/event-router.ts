import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";

export type DomainEventHandler = (event: BaseDomainEvent) => Promise<void>;

/**
 * In-process fan-out from a domain event to whatever reacts to it.
 *
 * **This is not the outbox relay, and does not pretend to be.** The outbox row
 * is still written inside the producing transaction and is still nobody's
 * input; this router runs after that transaction commits and calls handlers
 * directly. The consequence, stated once: if the isolate dies between the
 * commit and the dispatch, the handler never runs. The outbox row survives, so
 * a real relay can replay it later — which is what makes this choice
 * reversible rather than merely cheap. See follow-up #8.
 *
 * doazores does this with Cloudflare Queues and a cron sweep. Ntizo's
 * `wrangler.jsonc` declares neither, and a deployed Worker cannot reach
 * Postgres at all yet, so a queue-backed relay is infrastructure that could not
 * run if it were written.
 *
 * **A handler never fails its caller.** By the time this runs the write has
 * committed and the response may already have been sent; throwing would turn a
 * successful provider approval into a 500 over an inbox row. Handlers are
 * isolated from each other for the same reason — one bad template must not
 * silence the other three notifications an event produces.
 */
export class EventRouter {
  private readonly handlers = new Map<string, DomainEventHandler[]>();

  on(eventName: string, handler: DomainEventHandler): void {
    const existing = this.handlers.get(eventName);
    if (existing) existing.push(handler);
    else this.handlers.set(eventName, [handler]);
  }

  /**
   * How many handlers are registered for an event name.
   *
   * Exists for one test, and that test is the point: deleting the
   * `register*NotificationHandlers` calls from `api.ts` breaks nothing a
   * compiler or a unit test can see — every publisher keeps working, every
   * suite stays green, and the only symptom is an inbox that is silently
   * always empty. A comment cannot fail; this can.
   */
  handlerCount(eventName: string): number {
    return this.handlers.get(eventName)?.length ?? 0;
  }

  async dispatch(events: BaseDomainEvent[]): Promise<void> {
    for (const event of events) {
      const handlers = this.handlers.get(event.eventName);
      // Most events have no notification. An unhandled one is the normal case,
      // not a misconfiguration, so it is silent rather than logged.
      if (!handlers) continue;

      await Promise.all(
        handlers.map(async (handle) => {
          try {
            await handle(event);
          } catch (error) {
            // Not `getRequestScopedLogger()`: it throws when no request scope
            // is set, and nothing in this codebase calls
            // `setRequestScopedLogger()` today, so that call would throw
            // unconditionally. A throw here — inside a catch whose entire job
            // is to swallow a handler failure — would convert a swallowed
            // error into an unhandled rejection, which is the exact inversion
            // of what this class exists to do. This also runs after the
            // producing transaction has committed, possibly after the
            // response has already been sent, so there is no guarantee a
            // request scope even exists to log into. `tx-context.ts`'s
            // `drainAfterCommit` sits in the same position — after commit,
            // per-callback isolation, response possibly gone — and reaches
            // for `console.error` for the same reason; match it rather than
            // invent a third way to solve one problem.
            console.error("[events] handler failed", {
              eventName: event.eventName,
              error,
            });
          }
        }),
      );
    }
  }
}

/**
 * One router for the isolate.
 *
 * Module scope rather than request scope: handlers are wired once at bootstrap
 * and are stateless, and rebuilding the registry per request would mean every
 * producer needing a handle on it. Registration is idempotent in practice
 * because `bootstrap.ts` runs once per isolate.
 */
let router: EventRouter | undefined;

export function getEventRouter(): EventRouter {
  if (!router) router = new EventRouter();
  return router;
}

/** Testing seam. Never call this from application code. */
export function __resetEventRouterForTests(): void {
  router = undefined;
}
