import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { AvailabilityConfig, ExceptionKind, WeeklyRuleDraft } from "../domain/types";

const CONFIG = `
  query AvailabilityConfig($input: AvailabilityConfigInput!) {
    availabilityConfig(input: $input) {
      providerId
      timezone
      members {
        memberId
        userId
        name
        role
        weekly { id weekday startMinute endMinute }
        exceptions { id onDate kind startMinute endMinute note }
      }
      closures { id fromDate toDate note }
    }
  }`;

export const availabilityQueries = {
  config: (providerId: string) =>
    queryOptions({
      queryKey: ["provider", "availability", providerId],
      queryFn: async (): Promise<AvailabilityConfig> => {
        const d = await sessionGraphql<{ availabilityConfig: AvailabilityConfig }>(CONFIG, {
          input: { providerId },
        });
        return d.availabilityConfig;
      },
      // Only once there is a workspace to ask about — the same guard
      // `serviceQueries.mine` uses, for the same reason: without it the page
      // fires a query with an empty providerId while `useActiveProvider` is
      // still loading.
      enabled: providerId.length > 0,
    }),
};

const SET_WEEKLY_PATTERN = `
  mutation AvailabilitySetWeeklyPattern($input: AvailabilitySetWeeklyPatternInput!) {
    availabilitySetWeeklyPattern(input: $input) { ok }
  }`;

export interface SetWeeklyPatternInput {
  providerId: string;
  memberId: string;
  /** An empty array is a real instruction — this person works no fixed days. */
  rules: WeeklyRuleDraft[];
}

export async function setWeeklyPattern(input: SetWeeklyPatternInput): Promise<void> {
  await sessionGraphql(SET_WEEKLY_PATTERN, { input });
}

const ADD_EXCEPTION = `
  mutation AvailabilityAddException($input: AvailabilityAddExceptionInput!) {
    availabilityAddException(input: $input) { exceptionId }
  }`;

export interface AddExceptionInput {
  providerId: string;
  memberId: string;
  onDate: string;
  kind: ExceptionKind;
  /** Nullable, not merely optional — a closed day has no hours to state, and must send `null` explicitly. */
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
}

export async function addException(input: AddExceptionInput): Promise<{ exceptionId: string }> {
  const d = await sessionGraphql<{ availabilityAddException: { exceptionId: string } }>(
    ADD_EXCEPTION,
    { input },
  );
  return d.availabilityAddException;
}

const REMOVE_EXCEPTION = `
  mutation AvailabilityRemoveException($input: AvailabilityRemoveExceptionInput!) {
    availabilityRemoveException(input: $input) { ok }
  }`;

export async function removeException(input: {
  providerId: string;
  memberId: string;
  exceptionId: string;
}): Promise<void> {
  await sessionGraphql(REMOVE_EXCEPTION, { input });
}

const ADD_CLOSURE = `
  mutation AvailabilityAddClosure($input: AvailabilityAddClosureInput!) {
    availabilityAddClosure(input: $input) { closureId }
  }`;

export async function addClosure(input: {
  providerId: string;
  fromDate: string;
  toDate: string;
  note: string | null;
}): Promise<{ closureId: string }> {
  const d = await sessionGraphql<{ availabilityAddClosure: { closureId: string } }>(ADD_CLOSURE, {
    input,
  });
  return d.availabilityAddClosure;
}

const REMOVE_CLOSURE = `
  mutation AvailabilityRemoveClosure($input: AvailabilityRemoveClosureInput!) {
    availabilityRemoveClosure(input: $input) { ok }
  }`;

export async function removeClosure(input: { providerId: string; closureId: string }): Promise<void> {
  await sessionGraphql(REMOVE_CLOSURE, { input });
}
