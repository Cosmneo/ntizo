export * from "./bootstrap";
export { userReadSchema } from "./graphql/schema/queries";
export {
  createUserReadHandlers,
  type UserReadModule,
} from "./graphql/handlers/queries.handlers";
export type * from "./app/ports/inbound";
// The composition root depends on `findPlatformRole` to resolve the
// authoritative role per request — see apps/backend/api/src/graphql/context-factory.ts.
export type { UserReadRepositoryPort } from "./app/ports/outbound/user-read.repository.port";
