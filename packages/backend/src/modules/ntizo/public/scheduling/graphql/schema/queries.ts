import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { serviceAvailabilityReadModel } from "@ntizo/shared/read-models";

/** `YYYY-MM-DD`. A civil date, with no zone and no time attached. */
const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "a date must be written as YYYY-MM-DD");

/**
 * When a service can be had, over a window of dates.
 *
 * On the public tier because a visitor comparing two barbers reads it before
 * they have an account, and a calendar that needs a session to say "Wednesday
 * at nine" cannot sell anything. It is also why the window is an argument
 * rather than derived from a session's timezone: the answer is expressed in
 * the *provider's* wall clock, which is the only clock the appointment
 * actually happens on.
 *
 * `memberId` is optional on purpose. Given, it answers that one person's
 * calendar and refuses somebody who does not perform the service. Omitted, it
 * answers the union across every performer, and each start names who is free
 * at that moment — so a screen can offer the choice without a second query.
 */
export const listServiceAvailability = defineQuery({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      // Optional, not `.default()`: a zod default does not survive into the
      // GraphQL schema, so anything that needs one applies it in the handler.
      memberId: z.string().min(1).optional(),
      from: civilDate,
      to: civilDate,
    }),
  ),
  output: zodSchema(serviceAvailabilityReadModel),
  docs: { summary: "When a service can be booked, day by day", tags: ["Scheduling"] },
});

/**
 * No context schema, like every other public slice.
 *
 * Declaring the private one made every field on this mount demand a session,
 * and a page built to need nobody got "Authentication required". The public
 * mount deliberately supplies an empty context; a schema that asks for a
 * requester there can only ever refuse.
 */
export const schedulingPublicSchema = defineGraphQLSchema({
  availability: { forService: listServiceAvailability },
});
