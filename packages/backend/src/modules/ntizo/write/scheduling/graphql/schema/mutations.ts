import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/** `YYYY-MM-DD`, the civil-date wire format every scheduling mutation shares. */
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const weeklyRuleInput = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

export const setWeeklyPattern = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      memberId: z.string().min(1),
      // No `.min(1)`: an empty array is a real instruction — "this person
      // works no fixed days". Requiring one rule would make clearing a week
      // impossible.
      rules: z.array(weeklyRuleInput).max(60),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Replace a member's working week", tags: ["Scheduling"] },
});

export const addException = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      memberId: z.string().min(1),
      onDate: z.string().regex(CIVIL_DATE),
      kind: z.enum(["closed", "custom"]),
      // Nullable, not merely optional: a closed day has no hours to state,
      // and an optional-only field can say "leave it" but never "there is
      // none".
      startMinute: z.number().int().min(0).max(1439).nullable(),
      endMinute: z.number().int().min(1).max(1440).nullable(),
      note: z.string().trim().max(200).nullable(),
    }),
  ),
  output: zodSchema(z.object({ exceptionId: z.string().min(1) })),
  docs: { summary: "Mark a date as closed or worked differently", tags: ["Scheduling"] },
});

export const removeException = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      memberId: z.string().min(1),
      exceptionId: z.string().min(1),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Remove a date exception", tags: ["Scheduling"] },
});

export const addClosure = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      fromDate: z.string().regex(CIVIL_DATE),
      toDate: z.string().regex(CIVIL_DATE),
      note: z.string().trim().max(200).nullable(),
    }),
  ),
  output: zodSchema(z.object({ closureId: z.string().min(1) })),
  docs: { summary: "Close the whole workspace for a date range", tags: ["Scheduling"] },
});

export const removeClosure = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      closureId: z.string().min(1),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Remove a closure", tags: ["Scheduling"] },
});

export const schedulingWriteSchema = defineGraphQLSchema(
  {
    availability: {
      setWeeklyPattern,
      addException,
      removeException,
      addClosure,
      removeClosure,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
