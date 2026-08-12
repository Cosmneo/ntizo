import { MemberSchedule } from "../../../domain/aggregates/member-schedule.aggregate";

/**
 * A weekly row shaped for insertion: `id`, `providerId`, `memberId` and the
 * rule's own fields. `createdAt`/`updatedAt` are left off on purpose — the
 * column defaults set them, and listing them here would mean this mapper
 * fighting the schema over who owns a timestamp.
 */
export interface MemberAvailabilityInsertRow {
  id: string;
  providerId: string;
  memberId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** Same reasoning as {@link MemberAvailabilityInsertRow}, for `date_exception`. */
export interface DateExceptionInsertRow {
  id: string;
  providerId: string;
  memberId: string;
  onDate: string;
  kind: "closed" | "custom";
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
}

/**
 * The read side only needs what the domain actually reads back — not the
 * full select row. A DB row (with `providerId`, `memberId`, `createdAt`,
 * `updatedAt`) is a structural superset of this and is accepted here too.
 */
export interface MemberAvailabilityReadRow {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface DateExceptionReadRow {
  id: string;
  onDate: string;
  /** Comes back from the database as a plain `string` — narrowed below rather than cast. */
  kind: string;
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
}

export interface ScheduleRowSet {
  weekly: MemberAvailabilityInsertRow[];
  exceptions: DateExceptionInsertRow[];
}

/** `MemberSchedule` -> the rows `save` writes. */
export function toRows(schedule: MemberSchedule): ScheduleRowSet {
  const json = schedule.toJSON();
  return {
    weekly: json.weekly.map((rule) => ({
      id: rule.id,
      providerId: json.providerId,
      memberId: json.memberId,
      weekday: rule.weekday,
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
    })),
    exceptions: json.exceptions.map((exception) => ({
      id: exception.id,
      providerId: json.providerId,
      memberId: json.memberId,
      onDate: exception.onDate,
      kind: exception.kind,
      startMinute: exception.startMinute,
      endMinute: exception.endMinute,
      note: exception.note,
    })),
  };
}

/** The rows `findByMember` read — DB rows or the output of {@link toRows} alike — back to `MemberSchedule`. */
export function toDomain(
  providerId: string,
  memberId: string,
  weeklyRows: readonly MemberAvailabilityReadRow[],
  exceptionRows: readonly DateExceptionReadRow[],
): MemberSchedule {
  return MemberSchedule.rehydrate({
    providerId,
    memberId,
    weekly: weeklyRows.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    })),
    exceptions: exceptionRows.map((row) => ({
      id: row.id,
      onDate: row.onDate,
      // `kind` is a plain `text` column, not a real enum — narrowing it with a
      // ternary rather than a cast means a value the database allows but the
      // domain doesn't expect lands as "custom" instead of lying to the type
      // system about a value nobody checked.
      kind: row.kind === "closed" ? "closed" : "custom",
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      note: row.note,
    })),
  });
}
