import { randomUUID } from "node:crypto";
import {
  AvailabilityRuleInvalidError,
  ExceptionNotFoundError,
  ExceptionShapeInvalidError,
} from "../exceptions";

export interface WeeklyRuleInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
  // The rule's own shape — buffer, grid and capacity. All three optional and
  // nullable, and "absent" and "null" carry the same meaning ("use the
  // default") all the way to the column: nothing in this aggregate collapses
  // one into the other, so nothing here has to know which spelling a caller
  // used.
  bufferMinutes?: number | null;
  slotIntervalMinutes?: number | null;
  capacity?: number | null;
}
export interface WeeklyRule extends WeeklyRuleInput {
  id: string;
}
export interface ExceptionInput {
  onDate: string;
  kind: "closed" | "custom";
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
}
export interface DateExceptionEntry extends ExceptionInput {
  id: string;
}
export interface MemberScheduleProps {
  providerId: string;
  memberId: string;
  weekly: WeeklyRule[];
  exceptions: DateExceptionEntry[];
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertMinutes(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new AvailabilityRuleInvalidError("minutes must be whole numbers");
  }
  if (start < 0 || end > 1440) {
    throw new AvailabilityRuleInvalidError("a day runs from minute 0 to minute 1440");
  }
  if (end <= start) {
    throw new AvailabilityRuleInvalidError("it must end after it starts");
  }
}

/**
 * One member's working week and the dates that depart from it.
 *
 * The weekly pattern is replaced wholesale rather than patched rule by rule:
 * the screen edits a week as one thing, and a partial update would need a
 * diff nobody sends. An empty pattern is a legitimate state — it says this
 * person works no fixed days.
 */
export class MemberSchedule {
  private constructor(private props: MemberScheduleProps) {}

  static create(providerId: string, memberId: string): MemberSchedule {
    return new MemberSchedule({ providerId, memberId, weekly: [], exceptions: [] });
  }

  static rehydrate(props: MemberScheduleProps): MemberSchedule {
    return new MemberSchedule({
      ...props,
      weekly: [...props.weekly],
      exceptions: [...props.exceptions],
    });
  }

  get providerId(): string {
    return this.props.providerId;
  }
  get memberId(): string {
    return this.props.memberId;
  }
  get weekly(): readonly WeeklyRule[] {
    return this.props.weekly;
  }
  get exceptions(): readonly DateExceptionEntry[] {
    return this.props.exceptions;
  }

  setWeeklyPattern(rules: readonly WeeklyRuleInput[]): void {
    for (const rule of rules) {
      if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
        throw new AvailabilityRuleInvalidError("the weekday must be 0 (Sunday) to 6 (Saturday)");
      }
      assertMinutes(rule.startMinute, rule.endMinute);
    }
    this.props.weekly = rules.map((rule) => ({ ...rule, id: randomUUID() }));
  }

  addException(input: ExceptionInput): string {
    if (!CIVIL_DATE.test(input.onDate)) {
      throw new ExceptionShapeInvalidError("the date must be written as YYYY-MM-DD");
    }
    if (input.kind === "closed") {
      if (input.startMinute !== null || input.endMinute !== null) {
        throw new ExceptionShapeInvalidError("a closed day carries no hours");
      }
    } else {
      if (input.startMinute === null || input.endMinute === null) {
        throw new ExceptionShapeInvalidError("a custom day needs both hours");
      }
      assertMinutes(input.startMinute, input.endMinute);
    }
    const id = randomUUID();
    this.props.exceptions = [...this.props.exceptions, { ...input, id }];
    return id;
  }

  removeException(exceptionId: string): void {
    const next = this.props.exceptions.filter((e) => e.id !== exceptionId);
    if (next.length === this.props.exceptions.length) {
      throw new ExceptionNotFoundError(exceptionId);
    }
    this.props.exceptions = next;
  }

  toJSON(): MemberScheduleProps {
    return {
      providerId: this.props.providerId,
      memberId: this.props.memberId,
      weekly: this.props.weekly.map((r) => ({ ...r })),
      exceptions: this.props.exceptions.map((e) => ({ ...e })),
    };
  }
}
