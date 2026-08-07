import type { RequestMetadata } from "./request-metadata";
import type { Requester } from "./requester";

export interface ExecutionContext {
  requester: Requester;
  metadata: RequestMetadata;
}

export function requireAuthenticated(ctx: ExecutionContext) {
  if (ctx.requester.type !== "authenticated") {
    throw new Error("[execution-context] Unauthenticated request");
  }
  return ctx.requester.user;
}
