# Scheduling Bounded Context

## 1. Overview

The Scheduling Bounded Context manages **availability rules, time windows, slot generation, capacity tracking, exceptions, and scheduling configuration** for the Ntizo service marketplace platform. It is responsible for translating flexible provider availability definitions into concrete, bookable time slots.

**Owns:**
- Availability rule management (recurring weekly, date range, and one-time rules with multiple time windows)
- Availability exception management (blocked days and special-hours overrides)
- Slot generation algorithm (rules + exceptions + service duration + buffer = persisted slots)
- Slot capacity tracking (individual provider: capacity=1, organization: capacity=N available staff)
- Scheduling configuration per owner (advance booking window, cutoff hours, buffer minutes, timezone)

**Delegates:**
- Booking creation and orchestration to **Booking BC**
- Service duration and buffer definitions to **Catalog BC** (upstream)
- Organization/staff identity and roster to **User BC** (upstream)
- Notifications (slot changes, availability alerts) to **Communication BC**

**Core Algorithm:**
The Scheduling BC takes availability rules, applies exceptions with a strict priority system (Exceptions > ONE_TIME > DATE_RANGE > WEEKLY_RECURRING), combines them with service duration and buffer time from the Catalog BC, and generates persisted Slot entities. Each Slot tracks capacity: individual providers always have capacity=1, while organization slots have capacity equal to the number of staff members available at that time.

**Supports 3 Owner Types:**
- **Individual Provider** -- a person offering services independently; capacity is always 1
- **Organization** -- an establishment; capacity is determined by the number of available staff at any given time
- **Staff Member** -- a person within an organization; their availability must fall within the organization operating hours

---

## 2. Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Availability Rule** | A configurable rule that defines when an owner (individual, organization, or staff) is available to accept bookings. Rules have a type, optional date constraints, and one or more time windows. |
| **Rule Type** | Classification of an availability rule. `weekly_recurring`: repeats on specified days of the week. `date_range`: applies to a contiguous range of dates. `one_time`: applies to a single specific date. |
| **Time Window** | A start time and end time (HH:mm format) within a single day that defines a block of available hours. A rule can have multiple time windows to support split-day schedules (e.g., morning 09:00-12:00, afternoon 14:00-18:00). |
| **Availability Exception** | An override for a specific date that takes precedence over all rules. Can be `blocked` (no availability for the entire day) or `special` (custom hours that replace normal rules). |
| **Exception Type** | Classification of an exception. `blocked`: the entire day is unavailable, no slots are generated. `special`: custom time windows override all rules for that date. |
| **Slot** | A concrete, persisted time block that represents a bookable appointment window. Generated from rules/exceptions combined with service duration and buffer time. Tracks capacity and booked spots. |
| **Slot Capacity** | The maximum number of concurrent bookings a slot can accommodate. For individual providers this is always 1. For organizations, it equals the number of staff members available at that time. |
| **Buffer Time** | Minutes of rest or travel time inserted BETWEEN consecutive slots. Buffer time is not part of the slot duration itself. Example: 45min slot + 15min buffer means the next slot starts 60 minutes after the current slot started. |
| **Cutoff Time** | The minimum number of hours before a slot's start time that a booking can be made. Prevents last-minute bookings that providers cannot prepare for. |
| **Advance Booking Window** | The maximum number of days into the future for which slots are generated and bookable. Limits how far ahead customers can book. |
| **Scheduling Config** | Per-owner configuration that controls slot generation parameters: advance booking days, cutoff hours, buffer minutes, and timezone. |
| **Owner Type** | The type of entity that owns availability rules and slots. `individual`: a provider person. `organization`: an establishment. `staff`: a staff member within an organization. |
| **Slot Generation** | The process of computing and persisting Slot entities from availability rules, exceptions, service duration, and buffer time. Triggered when availability configuration changes or a new service is published. |
| **Slot Reservation** | The atomic operation of incrementing a slot's `booked_spots` counter when a booking is confirmed. Fails if no available spots remain. |
| **Slot Release** | The atomic operation of decrementing a slot's `booked_spots` counter when a booking is cancelled or expires. Fails if releasing more spots than are currently booked. |

---

## 3. Aggregates & Entities

### 3.1 AvailabilityRule Aggregate

**Aggregate Root:** `AvailabilityRule`
**Children:** `AvailabilityTimeWindow[]`

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `owner_type` | `OwnerType` | Enum: `individual`, `organization`, `staff`. Required |
| `owner_id` | `UUID` | FK to the owner entity (user, organization, or organization_member). Required |
| `rule_type` | `RuleType` | Enum: `weekly_recurring`, `date_range`, `one_time`. Required |
| `days_of_week` | `number[] \| null` | JSON array of day numbers (0=Sunday through 6=Saturday). Required for `weekly_recurring`, null otherwise |
| `start_date` | `Date \| null` | Start of date range. Required for `date_range`, null otherwise |
| `end_date` | `Date \| null` | End of date range. Required for `date_range`, null otherwise |
| `date` | `Date \| null` | Specific date. Required for `one_time`, null otherwise |
| `effective_from` | `Date \| null` | Optional start of the rule's effective period. Null means effective immediately |
| `effective_until` | `Date \| null` | Optional end of the rule's effective period. Null means no expiration |
| `is_active` | `boolean` | Default `true`. Inactive rules are excluded from slot generation |
| `description` | `string \| null` | Optional human-readable label for the rule |
| `time_windows` | `AvailabilityTimeWindow[]` | Child entity collection. At least one required |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### AvailabilityTimeWindow (Child Entity)

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `availability_rule_id` | `UUID` | FK -> availability_rules. Required |
| `start_time` | `string` | HH:mm format (e.g., "09:00"). Required |
| `end_time` | `string` | HH:mm format (e.g., "12:00"). Required |
| `sort_order` | `number` | Integer, default 0. Determines display position |

#### Invariants

1. A `weekly_recurring` rule must have a non-empty `days_of_week` array and at least one time window.
2. A `date_range` rule must have both `start_date` and `end_date`, with `start_date` strictly before `end_date`.
3. A `one_time` rule must have a `date` value.
4. Each time window's `start_time` must be strictly before its `end_time`.
5. Time windows within the same rule must not overlap.
6. A rule must have at least one time window.
7. Staff rules must fall within the parent organization's operating hours (cross-aggregate validation at the use case level).
8. `days_of_week` values must be integers in the range 0-6.
9. If `effective_from` and `effective_until` are both set, `effective_from` must be before `effective_until`.

#### Domain Logic

```typescript
import { Entity, DomainError } from 'onion-lasagna';

type RuleType = 'weekly_recurring' | 'date_range' | 'one_time';
type OwnerType = 'individual' | 'organization' | 'staff';

interface AvailabilityTimeWindowProps {
  availabilityRuleId: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
}

class AvailabilityTimeWindow extends Entity<AvailabilityTimeWindowProps> {
  static create(props: {
    availabilityRuleId: string;
    startTime: string;
    endTime: string;
    sortOrder?: number;
  }): AvailabilityTimeWindow {
    if (!AvailabilityTimeWindow.isValidTime(props.startTime)) {
      throw new DomainError(`Invalid start time format: ${props.startTime}. Expected HH:mm`);
    }
    if (!AvailabilityTimeWindow.isValidTime(props.endTime)) {
      throw new DomainError(`Invalid end time format: ${props.endTime}. Expected HH:mm`);
    }
    if (props.startTime >= props.endTime) {
      throw new DomainError(`Start time (${props.startTime}) must be before end time (${props.endTime})`);
    }

    return new AvailabilityTimeWindow({
      availabilityRuleId: props.availabilityRuleId,
      startTime: props.startTime,
      endTime: props.endTime,
      sortOrder: props.sortOrder ?? 0,
    });
  }

  static isValidTime(time: string): boolean {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(time);
  }

  overlapsWith(other: AvailabilityTimeWindow): boolean {
    return this.props.startTime < other.props.endTime && other.props.startTime < this.props.endTime;
  }
}

interface AvailabilityRuleProps {
  ownerType: OwnerType;
  ownerId: string;
  ruleType: RuleType;
  daysOfWeek: number[] | null;
  startDate: Date | null;
  endDate: Date | null;
  date: Date | null;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  isActive: boolean;
  description: string | null;
  timeWindows: AvailabilityTimeWindow[];
}

class AvailabilityRule extends Entity<AvailabilityRuleProps> {
  static create(props: {
    ownerType: OwnerType;
    ownerId: string;
    ruleType: RuleType;
    daysOfWeek?: number[] | null;
    startDate?: Date | null;
    endDate?: Date | null;
    date?: Date | null;
    effectiveFrom?: Date | null;
    effectiveUntil?: Date | null;
    description?: string | null;
    timeWindows: Array<{ startTime: string; endTime: string; sortOrder?: number }>;
  }): AvailabilityRule {
    if (props.timeWindows.length === 0) {
      throw new DomainError('At least one time window is required');
    }

    // Validate rule type specific fields
    if (props.ruleType === 'weekly_recurring') {
      if (!props.daysOfWeek || props.daysOfWeek.length === 0) {
        throw new DomainError('Weekly recurring rules must specify at least one day of the week');
      }
      const invalidDays = props.daysOfWeek.filter(d => d < 0 || d > 6 || !Number.isInteger(d));
      if (invalidDays.length > 0) {
        throw new DomainError(`Invalid days of week: ${invalidDays.join(', ')}. Must be integers 0-6`);
      }
    }

    if (props.ruleType === 'date_range') {
      if (!props.startDate || !props.endDate) {
        throw new DomainError('Date range rules must have both start_date and end_date');
      }
      if (props.startDate >= props.endDate) {
        throw new DomainError('start_date must be before end_date for date range rules');
      }
    }

    if (props.ruleType === 'one_time') {
      if (!props.date) {
        throw new DomainError('One-time rules must have a date');
      }
    }

    // Validate effective period
    if (props.effectiveFrom && props.effectiveUntil && props.effectiveFrom >= props.effectiveUntil) {
      throw new DomainError('effective_from must be before effective_until');
    }

    const rule = new AvailabilityRule({
      ownerType: props.ownerType,
      ownerId: props.ownerId,
      ruleType: props.ruleType,
      daysOfWeek: props.ruleType === 'weekly_recurring' ? props.daysOfWeek! : null,
      startDate: props.ruleType === 'date_range' ? props.startDate! : null,
      endDate: props.ruleType === 'date_range' ? props.endDate! : null,
      date: props.ruleType === 'one_time' ? props.date! : null,
      effectiveFrom: props.effectiveFrom ?? null,
      effectiveUntil: props.effectiveUntil ?? null,
      isActive: true,
      description: props.description ?? null,
      timeWindows: [],
    });

    // Add time windows with overlap validation
    for (const tw of props.timeWindows) {
      rule.addTimeWindow(tw);
    }

    return rule;
  }

  addTimeWindow(tw: { startTime: string; endTime: string; sortOrder?: number }): void {
    const window = AvailabilityTimeWindow.create({
      availabilityRuleId: this.id,
      startTime: tw.startTime,
      endTime: tw.endTime,
      sortOrder: tw.sortOrder ?? this.props.timeWindows.length,
    });

    // Check for overlaps with existing windows
    for (const existing of this.props.timeWindows) {
      if (window.overlapsWith(existing)) {
        throw new DomainError(
          `Time window ${tw.startTime}-${tw.endTime} overlaps with existing window ${existing.props.startTime}-${existing.props.endTime}`
        );
      }
    }

    this.props.timeWindows.push(window);
    this.markUpdated();
  }

  update(data: {
    daysOfWeek?: number[];
    startDate?: Date;
    endDate?: Date;
    date?: Date;
    effectiveFrom?: Date | null;
    effectiveUntil?: Date | null;
    description?: string | null;
    isActive?: boolean;
  }): void {
    if (data.daysOfWeek !== undefined && this.props.ruleType === 'weekly_recurring') {
      if (data.daysOfWeek.length === 0) {
        throw new DomainError('Weekly recurring rules must specify at least one day of the week');
      }
      const invalidDays = data.daysOfWeek.filter(d => d < 0 || d > 6 || !Number.isInteger(d));
      if (invalidDays.length > 0) {
        throw new DomainError(`Invalid days of week: ${invalidDays.join(', ')}. Must be integers 0-6`);
      }
      this.props.daysOfWeek = data.daysOfWeek;
    }

    if (data.startDate !== undefined && this.props.ruleType === 'date_range') {
      this.props.startDate = data.startDate;
    }
    if (data.endDate !== undefined && this.props.ruleType === 'date_range') {
      this.props.endDate = data.endDate;
    }
    if (this.props.startDate && this.props.endDate && this.props.startDate >= this.props.endDate) {
      throw new DomainError('start_date must be before end_date');
    }

    if (data.date !== undefined && this.props.ruleType === 'one_time') {
      this.props.date = data.date;
    }

    if (data.effectiveFrom !== undefined) this.props.effectiveFrom = data.effectiveFrom;
    if (data.effectiveUntil !== undefined) this.props.effectiveUntil = data.effectiveUntil;
    if (data.description !== undefined) this.props.description = data.description;
    if (data.isActive !== undefined) this.props.isActive = data.isActive;
    this.markUpdated();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.markUpdated();
  }

  appliesToDate(date: Date): boolean {
    if (!this.props.isActive) return false;

    // Check effective period
    if (this.props.effectiveFrom && date < this.props.effectiveFrom) return false;
    if (this.props.effectiveUntil && date > this.props.effectiveUntil) return false;

    switch (this.props.ruleType) {
      case 'weekly_recurring':
        return this.props.daysOfWeek!.includes(date.getDay());
      case 'date_range':
        return date >= this.props.startDate! && date <= this.props.endDate!;
      case 'one_time':
        return this.isSameDate(date, this.props.date!);
      default:
        return false;
    }
  }

  private isSameDate(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
}
```

---

### 3.2 AvailabilityException Aggregate

**Aggregate Root:** `AvailabilityException`
**Children:** `ExceptionTimeWindow[]` (only for `special` type)

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `owner_type` | `OwnerType` | Enum: `individual`, `organization`, `staff`. Required |
| `owner_id` | `UUID` | FK to the owner entity. Required |
| `exception_type` | `ExceptionType` | Enum: `blocked`, `special`. Required |
| `date` | `Date` | The specific date this exception applies to. Required |
| `reason` | `string \| null` | Optional explanation (e.g., "Public holiday", "Staff training day") |
| `time_windows` | `ExceptionTimeWindow[]` | Child entity collection. Required for `special`, empty for `blocked` |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### ExceptionTimeWindow (Child Entity)

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `availability_exception_id` | `UUID` | FK -> availability_exceptions. Required |
| `start_time` | `string` | HH:mm format. Required |
| `end_time` | `string` | HH:mm format. Required |
| `sort_order` | `number` | Integer, default 0 |

#### Invariants

1. `blocked` exceptions must have no time windows (the entire day is unavailable).
2. `special` exceptions must have at least one time window (custom hours for that date).
3. Only one exception per owner per date. If a second exception is created for the same date, it replaces the existing one.
4. Exceptions override ALL availability rules for their date, regardless of rule type or priority.
5. Each time window's `start_time` must be strictly before its `end_time`.
6. Time windows within the same exception must not overlap.

#### Domain Logic

```typescript
interface ExceptionTimeWindowProps {
  availabilityExceptionId: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
}

class ExceptionTimeWindow extends Entity<ExceptionTimeWindowProps> {
  static create(props: {
    availabilityExceptionId: string;
    startTime: string;
    endTime: string;
    sortOrder?: number;
  }): ExceptionTimeWindow {
    if (!AvailabilityTimeWindow.isValidTime(props.startTime)) {
      throw new DomainError(`Invalid start time format: ${props.startTime}. Expected HH:mm`);
    }
    if (!AvailabilityTimeWindow.isValidTime(props.endTime)) {
      throw new DomainError(`Invalid end time format: ${props.endTime}. Expected HH:mm`);
    }
    if (props.startTime >= props.endTime) {
      throw new DomainError(`Start time (${props.startTime}) must be before end time (${props.endTime})`);
    }

    return new ExceptionTimeWindow({
      availabilityExceptionId: props.availabilityExceptionId,
      startTime: props.startTime,
      endTime: props.endTime,
      sortOrder: props.sortOrder ?? 0,
    });
  }

  overlapsWith(other: ExceptionTimeWindow): boolean {
    return this.props.startTime < other.props.endTime && other.props.startTime < this.props.endTime;
  }
}

type ExceptionType = 'blocked' | 'special';

interface AvailabilityExceptionProps {
  ownerType: OwnerType;
  ownerId: string;
  exceptionType: ExceptionType;
  date: Date;
  reason: string | null;
  timeWindows: ExceptionTimeWindow[];
}

class AvailabilityException extends Entity<AvailabilityExceptionProps> {
  static create(props: {
    ownerType: OwnerType;
    ownerId: string;
    exceptionType: ExceptionType;
    date: Date;
    reason?: string | null;
    timeWindows?: Array<{ startTime: string; endTime: string; sortOrder?: number }>;
  }): AvailabilityException {
    if (props.exceptionType === 'blocked' && props.timeWindows && props.timeWindows.length > 0) {
      throw new DomainError('Blocked exceptions must not have time windows. The entire day is unavailable.');
    }

    if (props.exceptionType === 'special') {
      if (!props.timeWindows || props.timeWindows.length === 0) {
        throw new DomainError('Special exceptions must have at least one time window defining custom hours');
      }
    }

    const exception = new AvailabilityException({
      ownerType: props.ownerType,
      ownerId: props.ownerId,
      exceptionType: props.exceptionType,
      date: props.date,
      reason: props.reason ?? null,
      timeWindows: [],
    });

    if (props.exceptionType === 'special' && props.timeWindows) {
      for (const tw of props.timeWindows) {
        exception.addTimeWindow(tw);
      }
    }

    return exception;
  }

  addTimeWindow(tw: { startTime: string; endTime: string; sortOrder?: number }): void {
    if (this.props.exceptionType === 'blocked') {
      throw new DomainError('Cannot add time windows to a blocked exception');
    }

    const window = ExceptionTimeWindow.create({
      availabilityExceptionId: this.id,
      startTime: tw.startTime,
      endTime: tw.endTime,
      sortOrder: tw.sortOrder ?? this.props.timeWindows.length,
    });

    for (const existing of this.props.timeWindows) {
      if (window.overlapsWith(existing)) {
        throw new DomainError(
          `Time window ${tw.startTime}-${tw.endTime} overlaps with existing window ${existing.props.startTime}-${existing.props.endTime}`
        );
      }
    }

    this.props.timeWindows.push(window);
    this.markUpdated();
  }

  get isBlocked(): boolean {
    return this.props.exceptionType === 'blocked';
  }

  get isSpecial(): boolean {
    return this.props.exceptionType === 'special';
  }
}
```

---

### 3.3 Slot Aggregate

**Aggregate Root:** `Slot`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `owner_type` | `OwnerType` | Enum: `individual`, `organization`, `staff`. Required |
| `owner_id` | `UUID` | FK to the owner entity. Required |
| `service_id` | `UUID \| null` | FK -> services. Nullable (slots may be generated before service association) |
| `start_date_time` | `Date` | The start of the bookable time block. Required |
| `end_date_time` | `Date` | The end of the bookable time block. Required |
| `capacity` | `number` | Maximum concurrent bookings. 1 for individual, N for organization. Required |
| `booked_spots` | `number` | Number of currently booked spots. Default 0 |
| `available_spots` | `number` | Computed: capacity - booked_spots. Default = capacity |
| `source_type` | `SlotSourceType` | Enum: `rule`, `exception`. Indicates what generated this slot |
| `source_id` | `UUID` | FK to the rule or exception that generated this slot |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Invariants

1. `booked_spots + available_spots = capacity` must always hold true.
2. `booked_spots` must be >= 0.
3. `available_spots` must be >= 0.
4. Cannot reserve if `available_spots` = 0 (slot is full).
5. Cannot release more spots than `booked_spots`.
6. `start_date_time` must be strictly before `end_date_time`.
7. Slot duration equals the service duration. Buffer time is BETWEEN slots, not part of the slot itself.
8. `capacity` must be >= 1.

#### Domain Logic

```typescript
type SlotSourceType = 'rule' | 'exception';

interface SlotProps {
  ownerType: OwnerType;
  ownerId: string;
  serviceId: string | null;
  startDateTime: Date;
  endDateTime: Date;
  capacity: number;
  bookedSpots: number;
  availableSpots: number;
  sourceType: SlotSourceType;
  sourceId: string;
}

class Slot extends Entity<SlotProps> {
  static create(props: {
    ownerType: OwnerType;
    ownerId: string;
    serviceId?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    capacity: number;
    sourceType: SlotSourceType;
    sourceId: string;
  }): Slot {
    if (props.startDateTime >= props.endDateTime) {
      throw new DomainError('Slot start time must be before end time');
    }
    if (props.capacity < 1) {
      throw new DomainError('Slot capacity must be at least 1');
    }

    return new Slot({
      ownerType: props.ownerType,
      ownerId: props.ownerId,
      serviceId: props.serviceId ?? null,
      startDateTime: props.startDateTime,
      endDateTime: props.endDateTime,
      capacity: props.capacity,
      bookedSpots: 0,
      availableSpots: props.capacity,
      sourceType: props.sourceType,
      sourceId: props.sourceId,
    });
  }

  reserve(spots: number = 1): void {
    if (spots <= 0) {
      throw new DomainError('Must reserve at least 1 spot');
    }
    if (spots > this.props.availableSpots) {
      throw new DomainError(
        `Cannot reserve ${spots} spot(s). Only ${this.props.availableSpots} available out of ${this.props.capacity} total capacity.`
      );
    }

    this.props.bookedSpots += spots;
    this.props.availableSpots = this.props.capacity - this.props.bookedSpots;
    this.markUpdated();
    this.addDomainEvent(new SlotReserved(
      this.id,
      this.props.ownerType,
      this.props.ownerId,
      spots,
      this.props.bookedSpots,
      this.props.availableSpots,
    ));
  }

  release(spots: number = 1): void {
    if (spots <= 0) {
      throw new DomainError('Must release at least 1 spot');
    }
    if (spots > this.props.bookedSpots) {
      throw new DomainError(
        `Cannot release ${spots} spot(s). Only ${this.props.bookedSpots} are currently booked.`
      );
    }

    this.props.bookedSpots -= spots;
    this.props.availableSpots = this.props.capacity - this.props.bookedSpots;
    this.markUpdated();
    this.addDomainEvent(new SlotReleased(
      this.id,
      this.props.ownerType,
      this.props.ownerId,
      spots,
      this.props.bookedSpots,
      this.props.availableSpots,
    ));
  }

  isAvailable(): boolean {
    return this.props.availableSpots > 0;
  }

  isFull(): boolean {
    return this.props.availableSpots === 0;
  }

  get isInPast(): boolean {
    return this.props.startDateTime < new Date();
  }
}
```

---

### 3.4 SchedulingConfig Aggregate

**Aggregate Root:** `SchedulingConfig`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `owner_type` | `OwnerType` | Enum: `individual`, `organization`. Required (staff inherit from organization) |
| `owner_id` | `UUID` | FK to the owner entity. Required, unique per owner_type+owner_id |
| `advance_booking_days` | `number` | Default 30. Max 365. How many days ahead slots are generated |
| `cutoff_hours` | `number` | Default 2. Minimum hours before slot start for booking |
| `buffer_minutes` | `number` | Default 0. Minutes between consecutive slots |
| `timezone` | `string \| null` | IANA timezone string (e.g., "Africa/Maputo"). Nullable, auto-detect from location |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Invariants

1. `advance_booking_days` must be between 1 and 365.
2. `cutoff_hours` must be >= 0.
3. `buffer_minutes` must be >= 0.
4. Only one config per owner (unique constraint on `owner_type` + `owner_id`).
5. Staff members do not have their own config; they inherit the organization config.

#### Domain Logic

```typescript
interface SchedulingConfigProps {
  ownerType: OwnerType;
  ownerId: string;
  advanceBookingDays: number;
  cutoffHours: number;
  bufferMinutes: number;
  timezone: string | null;
}

class SchedulingConfig extends Entity<SchedulingConfigProps> {
  static create(props: {
    ownerType: OwnerType;
    ownerId: string;
    advanceBookingDays?: number;
    cutoffHours?: number;
    bufferMinutes?: number;
    timezone?: string | null;
  }): SchedulingConfig {
    const advanceBookingDays = props.advanceBookingDays ?? 30;
    const cutoffHours = props.cutoffHours ?? 2;
    const bufferMinutes = props.bufferMinutes ?? 0;

    if (advanceBookingDays < 1 || advanceBookingDays > 365) {
      throw new DomainError('Advance booking days must be between 1 and 365');
    }
    if (cutoffHours < 0) {
      throw new DomainError('Cutoff hours must be 0 or greater');
    }
    if (bufferMinutes < 0) {
      throw new DomainError('Buffer minutes must be 0 or greater');
    }

    return new SchedulingConfig({
      ownerType: props.ownerType,
      ownerId: props.ownerId,
      advanceBookingDays,
      cutoffHours,
      bufferMinutes,
      timezone: props.timezone ?? null,
    });
  }

  update(data: {
    advanceBookingDays?: number;
    cutoffHours?: number;
    bufferMinutes?: number;
    timezone?: string | null;
  }): void {
    if (data.advanceBookingDays !== undefined) {
      if (data.advanceBookingDays < 1 || data.advanceBookingDays > 365) {
        throw new DomainError('Advance booking days must be between 1 and 365');
      }
      this.props.advanceBookingDays = data.advanceBookingDays;
    }
    if (data.cutoffHours !== undefined) {
      if (data.cutoffHours < 0) {
        throw new DomainError('Cutoff hours must be 0 or greater');
      }
      this.props.cutoffHours = data.cutoffHours;
    }
    if (data.bufferMinutes !== undefined) {
      if (data.bufferMinutes < 0) {
        throw new DomainError('Buffer minutes must be 0 or greater');
      }
      this.props.bufferMinutes = data.bufferMinutes;
    }
    if (data.timezone !== undefined) {
      this.props.timezone = data.timezone;
    }
    this.markUpdated();
  }
}
```

---

## 4. Value Objects

### RuleType

```typescript
const RuleType = {
  WEEKLY_RECURRING: 'weekly_recurring',
  DATE_RANGE: 'date_range',
  ONE_TIME: 'one_time',
} as const;
type RuleType = (typeof RuleType)[keyof typeof RuleType];
```

### ExceptionType

```typescript
const ExceptionType = {
  BLOCKED: 'blocked',
  SPECIAL: 'special',
} as const;
type ExceptionType = (typeof ExceptionType)[keyof typeof ExceptionType];
```

### OwnerType

```typescript
const OwnerType = {
  INDIVIDUAL: 'individual',
  ORGANIZATION: 'organization',
  STAFF: 'staff',
} as const;
type OwnerType = (typeof OwnerType)[keyof typeof OwnerType];
```

### SlotSourceType

```typescript
const SlotSourceType = {
  RULE: 'rule',
  EXCEPTION: 'exception',
} as const;
type SlotSourceType = (typeof SlotSourceType)[keyof typeof SlotSourceType];
```

### TimeWindow

```typescript
class TimeWindow {
  private constructor(
    public readonly startTime: string,
    public readonly endTime: string,
  ) {}

  static create(startTime: string, endTime: string): TimeWindow {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime)) {
      throw new DomainError(`Invalid start time: ${startTime}. Expected HH:mm format.`);
    }
    if (!timeRegex.test(endTime)) {
      throw new DomainError(`Invalid end time: ${endTime}. Expected HH:mm format.`);
    }
    if (startTime >= endTime) {
      throw new DomainError(`Start time (${startTime}) must be before end time (${endTime})`);
    }
    return new TimeWindow(startTime, endTime);
  }

  get durationMinutes(): number {
    const [startH, startM] = this.startTime.split(':').map(Number);
    const [endH, endM] = this.endTime.split(':').map(Number);
    return (endH * 60 + endM) - (startH * 60 + startM);
  }

  contains(time: string): boolean {
    return time >= this.startTime && time < this.endTime;
  }

  overlapsWith(other: TimeWindow): boolean {
    return this.startTime < other.endTime && other.startTime < this.endTime;
  }

  equals(other: TimeWindow): boolean {
    return this.startTime === other.startTime && this.endTime === other.endTime;
  }
}
```

### DaysOfWeek

```typescript
class DaysOfWeek {
  private constructor(public readonly days: number[]) {}

  static create(days: number[]): DaysOfWeek {
    if (days.length === 0) {
      throw new DomainError('At least one day must be specified');
    }
    const unique = [...new Set(days)].sort();
    for (const day of unique) {
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        throw new DomainError(`Invalid day: ${day}. Must be an integer 0 (Sunday) through 6 (Saturday)`);
      }
    }
    return new DaysOfWeek(unique);
  }

  static weekdays(): DaysOfWeek {
    return new DaysOfWeek([1, 2, 3, 4, 5]);
  }

  static weekends(): DaysOfWeek {
    return new DaysOfWeek([0, 6]);
  }

  static everyday(): DaysOfWeek {
    return new DaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
  }

  includes(day: number): boolean {
    return this.days.includes(day);
  }

  equals(other: DaysOfWeek): boolean {
    return JSON.stringify(this.days) === JSON.stringify(other.days);
  }
}
```

### DateRange

```typescript
class DateRange {
  private constructor(
    public readonly startDate: Date,
    public readonly endDate: Date,
  ) {}

  static create(startDate: Date, endDate: Date): DateRange {
    if (startDate >= endDate) {
      throw new DomainError('Start date must be before end date');
    }
    return new DateRange(startDate, endDate);
  }

  containsDate(date: Date): boolean {
    return date >= this.startDate && date <= this.endDate;
  }

  get totalDays(): number {
    const diffMs = this.endDate.getTime() - this.startDate.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }

  *eachDate(): Generator<Date> {
    const current = new Date(this.startDate);
    while (current <= this.endDate) {
      yield new Date(current);
      current.setDate(current.getDate() + 1);
    }
  }

  equals(other: DateRange): boolean {
    return this.startDate.getTime() === other.startDate.getTime()
      && this.endDate.getTime() === other.endDate.getTime();
  }
}
```

### SlotCapacity

```typescript
class SlotCapacity {
  private constructor(
    public readonly capacity: number,
    public readonly bookedSpots: number,
    public readonly availableSpots: number,
  ) {}

  static create(capacity: number, bookedSpots: number = 0): SlotCapacity {
    if (capacity < 1) {
      throw new DomainError('Capacity must be at least 1');
    }
    if (bookedSpots < 0) {
      throw new DomainError('Booked spots cannot be negative');
    }
    if (bookedSpots > capacity) {
      throw new DomainError('Booked spots cannot exceed capacity');
    }
    return new SlotCapacity(capacity, bookedSpots, capacity - bookedSpots);
  }

  get isAvailable(): boolean {
    return this.availableSpots > 0;
  }

  get isFull(): boolean {
    return this.availableSpots === 0;
  }

  equals(other: SlotCapacity): boolean {
    return this.capacity === other.capacity
      && this.bookedSpots === other.bookedSpots;
  }
}
```

---

## 5. Domain Events

### SlotsRegenerated

- **Trigger:** Availability configuration changes (rule created/updated/deleted, exception created/deleted, scheduling config updated, staff added/removed).
- **Payload:**
  ```typescript
  interface SlotsRegeneratedEvent {
    ownerType: OwnerType;
    ownerId: string;
    dateRangeStart: Date;
    dateRangeEnd: Date;
    slotsCount: number;
    regeneratedAt: Date;
  }
  ```
- **Handlers:**
  - Booking BC: Verify that any existing bookings within the affected date range still have valid slots. If a slot was removed that had an active booking, trigger a rebooking or cancellation flow.

### SlotReserved

- **Trigger:** A booking is confirmed and a slot is reserved.
- **Payload:**
  ```typescript
  interface SlotReservedEvent {
    slotId: string;
    ownerType: OwnerType;
    ownerId: string;
    serviceId: string | null;
    spots: number;
    bookedSpots: number;
    availableSpots: number;
    reservedAt: Date;
  }
  ```
- **Handlers:**
  - Booking BC: Confirm the booking has a reserved slot.
  - Communication BC: Notify the provider that a new booking slot has been reserved (if notifications are enabled).

### SlotReleased

- **Trigger:** A booking is cancelled or expires, releasing the reserved slot.
- **Payload:**
  ```typescript
  interface SlotReleasedEvent {
    slotId: string;
    ownerType: OwnerType;
    ownerId: string;
    serviceId: string | null;
    spots: number;
    bookedSpots: number;
    availableSpots: number;
    releasedAt: Date;
  }
  ```
- **Handlers:**
  - Booking BC: Confirm the booking's slot has been released.
  - Communication BC: Notify customers on a waiting list (if implemented) that a slot has become available.

---

## 6. Use Cases

### GenerateSlots (Critical Use Case)

- **Actor:** System (triggered by events or manual regeneration)
- **Preconditions:** Owner has at least one active availability rule. Service exists with valid duration.
- **Input:**
  ```typescript
  interface GenerateSlotsInput {
    ownerType: OwnerType;
    ownerId: string;
    serviceId: string;
    dateRange: { start: Date; end: Date };
  }
  ```
- **Output:** `Slot[]` (persisted)
- **Algorithm:**

```
Input: ownerType, ownerId, serviceId, dateRange
1. Load SchedulingConfig for owner
   - If staff, load parent organization config
   - Use defaults if no config exists (30 days, 2h cutoff, 0 buffer)
2. Load service from Catalog (need duration_minutes and buffer_minutes)
   - buffer_minutes from service overrides config buffer_minutes if > 0
3. Delete existing slots for this owner+service in the date range
4. For each date in dateRange:
   a. Skip if date is in the past
   b. Check for exception on this date (for this owner)
      - If BLOCKED exception found -> skip this date entirely (no slots)
      - If SPECIAL exception found -> use exception's time windows
   c. If no exception, find applicable rules by priority:
      i.   ONE_TIME rules matching this exact date
      ii.  DATE_RANGE rules whose range covers this date
      iii. WEEKLY_RECURRING rules matching this day of the week
      -> Use the FIRST matching rule found (highest priority)
   d. Collect time windows from the selected source (exception or rule)
   e. For each time window:
      - Parse startTime and endTime into minutes-from-midnight
      - Set cursor = window start (in minutes)
      - While cursor + duration_minutes <= window end (in minutes):
        - Create slot: start = cursor, end = cursor + duration_minutes
        - Advance cursor by (duration_minutes + buffer_minutes)
      - The last slot must END at or before the window end time
   f. For each generated slot time:
      - Calculate capacity:
        - If ownerType = individual -> capacity = 1
        - If ownerType = organization -> capacity = count of active staff
          members who are available at this specific time
          - If capacity = 0 (no staff available) -> skip this slot entirely
        - If ownerType = staff -> capacity = 1
      - Create and persist Slot entity with calculated capacity
5. Raise SlotsRegenerated event
6. Return generated slots
```

**Slot Generation Example:**

Window: 09:00-12:00, Service duration: 45min, Buffer: 15min

| Slot # | Start | End   | Buffer Until |
|--------|-------|-------|-------------|
| 1      | 09:00 | 09:45 | 10:00       |
| 2      | 10:00 | 10:45 | 11:00       |
| 3      | 11:00 | 11:45 | 12:00       |

Slot 3 is the last because the next potential slot would start at 12:00 (11:45 + 15min buffer), but 12:00 + 45min = 12:45 which exceeds the window end.

**Multi-Staff Organization Capacity Example:**

Organization has 3 active staff members. At 10:00 on a Tuesday:
- Staff A: available (has a weekly_recurring rule covering Tuesday 09:00-17:00)
- Staff B: available (has a weekly_recurring rule covering Tuesday 10:00-14:00)
- Staff C: blocked (has a blocked exception for this date)

Capacity at 10:00 = 2 (Staff A + Staff B).

---

### CreateAvailabilityRule

- **Actor:** Provider (individual_provider), Organization owner/manager, or Staff member
- **Preconditions:** Actor has appropriate permissions for the owner entity.
- **Input:**
  ```typescript
  interface CreateAvailabilityRuleInput {
    callerId: string;
    ownerType: OwnerType;
    ownerId: string;
    ruleType: RuleType;
    daysOfWeek?: number[];
    startDate?: Date;
    endDate?: Date;
    date?: Date;
    effectiveFrom?: Date;
    effectiveUntil?: Date;
    description?: string;
    timeWindows: Array<{ startTime: string; endTime: string; sortOrder?: number }>;
  }
  ```
- **Output:** `AvailabilityRule`
- **Process Flow:**
  1. Validate caller authorization (provider owns the profile, or is owner/manager of the organization, or is the staff member).
  2. If owner_type is `staff`, validate that all time windows fall within the parent organization operating hours.
  3. Create AvailabilityRule entity with time windows.
  4. Persist via AvailabilityRuleRepository.
  5. Trigger slot regeneration for affected date range.
  6. Return created AvailabilityRule.
- **Events Raised:** `SlotsRegenerated` (via slot regeneration)
- **Error Cases:**
  - `UnauthorizedError`: Caller does not have permission.
  - `ValidationError`: Invalid rule type fields, overlapping time windows, or missing required fields.
  - `StaffHoursOutOfBoundsError`: Staff time windows exceed organization operating hours.

### UpdateAvailabilityRule

- **Actor:** Provider, Organization owner/manager, or Staff member
- **Preconditions:** Rule exists. Caller has permission.
- **Input:**
  ```typescript
  interface UpdateAvailabilityRuleInput {
    ruleId: string;
    callerId: string;
    daysOfWeek?: number[];
    startDate?: Date;
    endDate?: Date;
    date?: Date;
    effectiveFrom?: Date | null;
    effectiveUntil?: Date | null;
    description?: string | null;
    isActive?: boolean;
    timeWindows?: Array<{ startTime: string; endTime: string; sortOrder?: number }>;
  }
  ```
- **Output:** Updated `AvailabilityRule`
- **Process Flow:**
  1. Load AvailabilityRule by ID.
  2. Verify caller authorization.
  3. Apply updates to the rule. If time windows are provided, replace all existing windows (delete old, add new).
  4. Persist via AvailabilityRuleRepository.
  5. Trigger slot regeneration for affected date range.
  6. Return updated AvailabilityRule.
- **Events Raised:** `SlotsRegenerated` (via slot regeneration)
- **Error Cases:**
  - `RuleNotFoundError`: Rule does not exist.
  - `UnauthorizedError`: Caller does not have permission.
  - `ValidationError`: Invalid fields or overlapping time windows.

### DeleteAvailabilityRule

- **Actor:** Provider, Organization owner/manager, or Staff member
- **Preconditions:** Rule exists. Caller has permission.
- **Input:**
  ```typescript
  interface DeleteAvailabilityRuleInput {
    ruleId: string;
    callerId: string;
  }
  ```
- **Output:** `void`
- **Process Flow:**
  1. Load AvailabilityRule by ID.
  2. Verify caller authorization.
  3. Delete via AvailabilityRuleRepository (cascades to time windows).
  4. Trigger slot regeneration for affected date range.
- **Events Raised:** `SlotsRegenerated` (via slot regeneration)
- **Error Cases:**
  - `RuleNotFoundError`: Rule does not exist.
  - `UnauthorizedError`: Caller does not have permission.

### CreateAvailabilityException

- **Actor:** Provider, Organization owner/manager, or Staff member
- **Preconditions:** Caller has permission. No existing exception for the same owner+date.
- **Input:**
  ```typescript
  interface CreateAvailabilityExceptionInput {
    callerId: string;
    ownerType: OwnerType;
    ownerId: string;
    exceptionType: ExceptionType;
    date: Date;
    reason?: string;
    timeWindows?: Array<{ startTime: string; endTime: string; sortOrder?: number }>;
  }
  ```
- **Output:** `AvailabilityException`
- **Process Flow:**
  1. Validate caller authorization.
  2. Check if an exception already exists for this owner+date. If so, replace it (delete old, create new).
  3. Create AvailabilityException entity.
  4. Persist via AvailabilityExceptionRepository.
  5. Trigger slot regeneration for the affected date.
  6. Return created AvailabilityException.
- **Events Raised:** `SlotsRegenerated` (via slot regeneration)
- **Error Cases:**
  - `UnauthorizedError`: Caller does not have permission.
  - `ValidationError`: Invalid exception type or missing time windows for special type.

### DeleteAvailabilityException

- **Actor:** Provider, Organization owner/manager, or Staff member
- **Preconditions:** Exception exists. Caller has permission.
- **Input:**
  ```typescript
  interface DeleteAvailabilityExceptionInput {
    exceptionId: string;
    callerId: string;
  }
  ```
- **Output:** `void`
- **Process Flow:**
  1. Load AvailabilityException by ID.
  2. Verify caller authorization.
  3. Delete via AvailabilityExceptionRepository (cascades to time windows).
  4. Trigger slot regeneration for the affected date.
- **Events Raised:** `SlotsRegenerated` (via slot regeneration)
- **Error Cases:**
  - `ExceptionNotFoundError`: Exception does not exist.
  - `UnauthorizedError`: Caller does not have permission.

### UpdateSchedulingConfig

- **Actor:** Provider (individual_provider) or Organization owner/manager
- **Preconditions:** Caller has permission. Config exists (or is created with defaults).
- **Input:**
  ```typescript
  interface UpdateSchedulingConfigInput {
    callerId: string;
    ownerType: OwnerType;
    ownerId: string;
    advanceBookingDays?: number;
    cutoffHours?: number;
    bufferMinutes?: number;
    timezone?: string | null;
  }
  ```
- **Output:** Updated `SchedulingConfig`
- **Process Flow:**
  1. Verify caller authorization.
  2. Load existing SchedulingConfig for owner. If none exists, create with defaults.
  3. Apply updates via `config.update(data)`.
  4. Persist via SchedulingConfigRepository.
  5. Trigger full slot regeneration for the owner (advance booking window may have changed).
  6. Return updated SchedulingConfig.
- **Events Raised:** `SlotsRegenerated` (via slot regeneration)
- **Error Cases:**
  - `UnauthorizedError`: Caller does not have permission.
  - `ValidationError`: Invalid configuration values.

### GetAvailableSlots

- **Actor:** Customer (or any authenticated user browsing the marketplace)
- **Preconditions:** Service exists and is published.
- **Input:**
  ```typescript
  interface GetAvailableSlotsInput {
    serviceId: string;
    date: Date;
    staffId?: string;
  }
  ```
- **Output:** `Slot[]` (only slots with available_spots > 0)
- **Process Flow:**
  1. Load service to get owner information (provider_id or organization_id).
  2. Load SchedulingConfig for the owner.
  3. Validate that the requested date is within the advance booking window.
  4. Validate that slots on the requested date are not past the cutoff time.
  5. Query SlotRepository for available slots matching the criteria.
  6. If staffId is provided (for organization services), filter to slots where the specific staff member is available.
  7. Return slots sorted by start_date_time ascending.
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `DateOutOfRangeError`: Requested date exceeds advance booking window.

### ReserveSlotCapacity

- **Actor:** System (called by Booking BC when a booking is confirmed)
- **Preconditions:** Slot exists with available spots.
- **Input:**
  ```typescript
  interface ReserveSlotCapacityInput {
    slotId: string;
    spots: number;
  }
  ```
- **Output:** Updated `Slot`
- **Process Flow:**
  1. Load Slot by ID with row-level locking (SELECT FOR UPDATE).
  2. Call `slot.reserve(spots)`.
  3. Persist via SlotRepository.
  4. Return updated Slot.
- **Events Raised:** `SlotReserved`
- **Error Cases:**
  - `SlotNotFoundError`: Slot does not exist.
  - `SlotFullError`: No available spots remaining.
  - `ConcurrencyError`: Optimistic lock conflict (retry).

### ReleaseSlotCapacity

- **Actor:** System (called by Booking BC when a booking is cancelled or expires)
- **Preconditions:** Slot exists with booked spots.
- **Input:**
  ```typescript
  interface ReleaseSlotCapacityInput {
    slotId: string;
    spots: number;
  }
  ```
- **Output:** Updated `Slot`
- **Process Flow:**
  1. Load Slot by ID with row-level locking (SELECT FOR UPDATE).
  2. Call `slot.release(spots)`.
  3. Persist via SlotRepository.
  4. Return updated Slot.
- **Events Raised:** `SlotReleased`
- **Error Cases:**
  - `SlotNotFoundError`: Slot does not exist.
  - `InvalidReleaseError`: Attempting to release more spots than are booked.

---

## 7. Repository Ports

```typescript
interface AvailabilityRuleRepository {
  findById(id: string): Promise<AvailabilityRule | null>;
  findByOwner(ownerType: OwnerType, ownerId: string): Promise<AvailabilityRule[]>;
  findActiveByOwner(ownerType: OwnerType, ownerId: string): Promise<AvailabilityRule[]>;
  findRulesForDate(
    ownerType: OwnerType,
    ownerId: string,
    date: Date,
  ): Promise<AvailabilityRule[]>;
  save(rule: AvailabilityRule): Promise<void>;
  delete(id: string): Promise<void>;
}

interface AvailabilityExceptionRepository {
  findById(id: string): Promise<AvailabilityException | null>;
  findByOwner(ownerType: OwnerType, ownerId: string): Promise<AvailabilityException[]>;
  findByOwnerAndDateRange(
    ownerType: OwnerType,
    ownerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AvailabilityException[]>;
  findForDate(
    ownerType: OwnerType,
    ownerId: string,
    date: Date,
  ): Promise<AvailabilityException | null>;
  save(exception: AvailabilityException): Promise<void>;
  delete(id: string): Promise<void>;
}

interface SlotRepository {
  findById(id: string): Promise<Slot | null>;
  findByIdForUpdate(id: string): Promise<Slot | null>;
  findAvailable(
    ownerType: OwnerType,
    ownerId: string,
    serviceId: string,
    date: Date,
  ): Promise<Slot[]>;
  findByOwnerAndDateRange(
    ownerType: OwnerType,
    ownerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Slot[]>;
  findByServiceAndDateRange(
    serviceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Slot[]>;
  save(slot: Slot): Promise<void>;
  saveBatch(slots: Slot[]): Promise<void>;
  deleteByOwnerAndDateRange(
    ownerType: OwnerType,
    ownerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number>;
  deleteByOwnerServiceAndDateRange(
    ownerType: OwnerType,
    ownerId: string,
    serviceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number>;
  reserveSpots(slotId: string, spots: number): Promise<Slot>;
  releaseSpots(slotId: string, spots: number): Promise<Slot>;
}

interface SchedulingConfigRepository {
  findByOwner(ownerType: OwnerType, ownerId: string): Promise<SchedulingConfig | null>;
  save(config: SchedulingConfig): Promise<void>;
}
```

---

## 8. Entity Schemas

### Availability Rules Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `owner_type` | `varchar(20)` | NOT NULL, CHECK IN (`individual`, `organization`, `staff`) |
| `owner_id` | `uuid` | NOT NULL |
| `rule_type` | `varchar(20)` | NOT NULL, CHECK IN (`weekly_recurring`, `date_range`, `one_time`) |
| `days_of_week` | `jsonb` | nullable |
| `start_date` | `date` | nullable |
| `end_date` | `date` | nullable |
| `date` | `date` | nullable |
| `effective_from` | `date` | nullable |
| `effective_until` | `date` | nullable |
| `is_active` | `boolean` | NOT NULL, default `true` |
| `description` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_availability_rules_owner` on (`owner_type`, `owner_id`)
- `idx_availability_rules_rule_type` on `rule_type`
- `idx_availability_rules_is_active` on `is_active`
- `idx_availability_rules_date` on `date` (for one_time lookups)
- `idx_availability_rules_date_range` on (`start_date`, `end_date`) (for date_range lookups)

### Availability Time Windows Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `availability_rule_id` | `uuid` | FK -> `availability_rules.id`, NOT NULL, ON DELETE CASCADE |
| `start_time` | `time` | NOT NULL |
| `end_time` | `time` | NOT NULL |
| `sort_order` | `integer` | NOT NULL, default `0` |

**Indexes:**
- `idx_availability_time_windows_rule_id` on `availability_rule_id`

### Availability Exceptions Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `owner_type` | `varchar(20)` | NOT NULL, CHECK IN (`individual`, `organization`, `staff`) |
| `owner_id` | `uuid` | NOT NULL |
| `exception_type` | `varchar(20)` | NOT NULL, CHECK IN (`blocked`, `special`) |
| `date` | `date` | NOT NULL |
| `reason` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_availability_exceptions_owner` on (`owner_type`, `owner_id`)
- `idx_availability_exceptions_date` on `date`
- `uq_availability_exceptions_owner_date` UNIQUE on (`owner_type`, `owner_id`, `date`) -- enforces one exception per owner per date

### Exception Time Windows Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `availability_exception_id` | `uuid` | FK -> `availability_exceptions.id`, NOT NULL, ON DELETE CASCADE |
| `start_time` | `time` | NOT NULL |
| `end_time` | `time` | NOT NULL |
| `sort_order` | `integer` | NOT NULL, default `0` |

**Indexes:**
- `idx_exception_time_windows_exception_id` on `availability_exception_id`

### Slots Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `owner_type` | `varchar(20)` | NOT NULL, CHECK IN (`individual`, `organization`, `staff`) |
| `owner_id` | `uuid` | NOT NULL |
| `service_id` | `uuid` | nullable |
| `start_date_time` | `timestamptz` | NOT NULL |
| `end_date_time` | `timestamptz` | NOT NULL |
| `capacity` | `integer` | NOT NULL, CHECK `>= 1` |
| `booked_spots` | `integer` | NOT NULL, default `0`, CHECK `>= 0` |
| `available_spots` | `integer` | NOT NULL, CHECK `>= 0` |
| `source_type` | `varchar(20)` | NOT NULL, CHECK IN (`rule`, `exception`) |
| `source_id` | `uuid` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_slots_owner_start` on (`owner_type`, `owner_id`, `start_date_time`) -- primary query index for availability
- `idx_slots_service_start` on (`service_id`, `start_date_time`) -- query by service
- `idx_slots_available` on (`owner_type`, `owner_id`, `start_date_time`) WHERE `available_spots > 0` -- partial index for fast availability queries
- `idx_slots_source` on (`source_type`, `source_id`) -- for slot regeneration cleanup

### Scheduling Configs Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `owner_type` | `varchar(20)` | NOT NULL, CHECK IN (`individual`, `organization`) |
| `owner_id` | `uuid` | NOT NULL |
| `advance_booking_days` | `integer` | NOT NULL, default `30`, CHECK `>= 1 AND <= 365` |
| `cutoff_hours` | `integer` | NOT NULL, default `2`, CHECK `>= 0` |
| `buffer_minutes` | `integer` | NOT NULL, default `0`, CHECK `>= 0` |
| `timezone` | `varchar(50)` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `uq_scheduling_configs_owner` UNIQUE on (`owner_type`, `owner_id`) -- one config per owner

### Drizzle ORM Schema

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
  integer,
  time,
  date,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerType: varchar('owner_type', { length: 20 }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    ruleType: varchar('rule_type', { length: 20 }).notNull(),
    daysOfWeek: jsonb('days_of_week'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    date: date('date'),
    effectiveFrom: date('effective_from'),
    effectiveUntil: date('effective_until'),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_availability_rules_owner').on(table.ownerType, table.ownerId),
    index('idx_availability_rules_rule_type').on(table.ruleType),
    index('idx_availability_rules_is_active').on(table.isActive),
    index('idx_availability_rules_date').on(table.date),
    index('idx_availability_rules_date_range').on(table.startDate, table.endDate),
    check(
      'owner_type_check',
      sql`${table.ownerType} IN ('individual', 'organization', 'staff')`,
    ),
    check(
      'rule_type_check',
      sql`${table.ruleType} IN ('weekly_recurring', 'date_range', 'one_time')`,
    ),
  ],
);

export const availabilityTimeWindows = pgTable(
  'availability_time_windows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    availabilityRuleId: uuid('availability_rule_id')
      .notNull()
      .references(() => availabilityRules.id, { onDelete: 'cascade' }),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_availability_time_windows_rule_id').on(table.availabilityRuleId),
    check(
      'time_window_order_check',
      sql`${table.startTime} < ${table.endTime}`,
    ),
  ],
);

export const availabilityExceptions = pgTable(
  'availability_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerType: varchar('owner_type', { length: 20 }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    exceptionType: varchar('exception_type', { length: 20 }).notNull(),
    date: date('date').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_availability_exceptions_owner').on(table.ownerType, table.ownerId),
    index('idx_availability_exceptions_date').on(table.date),
    uniqueIndex('uq_availability_exceptions_owner_date').on(
      table.ownerType,
      table.ownerId,
      table.date,
    ),
    check(
      'exception_owner_type_check',
      sql`${table.ownerType} IN ('individual', 'organization', 'staff')`,
    ),
    check(
      'exception_type_check',
      sql`${table.exceptionType} IN ('blocked', 'special')`,
    ),
  ],
);

export const exceptionTimeWindows = pgTable(
  'exception_time_windows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    availabilityExceptionId: uuid('availability_exception_id')
      .notNull()
      .references(() => availabilityExceptions.id, { onDelete: 'cascade' }),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_exception_time_windows_exception_id').on(table.availabilityExceptionId),
    check(
      'exception_time_window_order_check',
      sql`${table.startTime} < ${table.endTime}`,
    ),
  ],
);

export const slots = pgTable(
  'slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerType: varchar('owner_type', { length: 20 }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    serviceId: uuid('service_id'),
    startDateTime: timestamp('start_date_time', { withTimezone: true }).notNull(),
    endDateTime: timestamp('end_date_time', { withTimezone: true }).notNull(),
    capacity: integer('capacity').notNull(),
    bookedSpots: integer('booked_spots').notNull().default(0),
    availableSpots: integer('available_spots').notNull(),
    sourceType: varchar('source_type', { length: 20 }).notNull(),
    sourceId: uuid('source_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_slots_owner_start').on(table.ownerType, table.ownerId, table.startDateTime),
    index('idx_slots_service_start').on(table.serviceId, table.startDateTime),
    index('idx_slots_source').on(table.sourceType, table.sourceId),
    index('idx_slots_available')
      .on(table.ownerType, table.ownerId, table.startDateTime)
      .where(sql`${table.availableSpots} > 0`),
    check(
      'slot_owner_type_check',
      sql`${table.ownerType} IN ('individual', 'organization', 'staff')`,
    ),
    check(
      'slot_source_type_check',
      sql`${table.sourceType} IN ('rule', 'exception')`,
    ),
    check('slot_capacity_check', sql`${table.capacity} >= 1`),
    check('slot_booked_spots_check', sql`${table.bookedSpots} >= 0`),
    check('slot_available_spots_check', sql`${table.availableSpots} >= 0`),
    check(
      'slot_capacity_invariant_check',
      sql`${table.bookedSpots} + ${table.availableSpots} = ${table.capacity}`,
    ),
    check(
      'slot_time_order_check',
      sql`${table.startDateTime} < ${table.endDateTime}`,
    ),
  ],
);

export const schedulingConfigs = pgTable(
  'scheduling_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerType: varchar('owner_type', { length: 20 }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    advanceBookingDays: integer('advance_booking_days').notNull().default(30),
    cutoffHours: integer('cutoff_hours').notNull().default(2),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    timezone: varchar('timezone', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_scheduling_configs_owner').on(table.ownerType, table.ownerId),
    check(
      'config_owner_type_check',
      sql`${table.ownerType} IN ('individual', 'organization')`,
    ),
    check(
      'advance_booking_days_check',
      sql`${table.advanceBookingDays} >= 1 AND ${table.advanceBookingDays} <= 365`,
    ),
    check('cutoff_hours_check', sql`${table.cutoffHours} >= 0`),
    check('buffer_minutes_check', sql`${table.bufferMinutes} >= 0`),
  ],
);
```

---

## 9. Business Rules & Invariants

### Availability Rule Rules

| # | Rule | Enforcement |
|---|------|-------------|
| AR1 | Rule priority: Exceptions > ONE_TIME > DATE_RANGE > WEEKLY_RECURRING. When multiple rules could apply to a date, the highest-priority one wins exclusively. | Slot generation algorithm (use case logic) |
| AR2 | Weekly recurring rules must specify at least one day of the week (0-6) and at least one time window. | Domain logic in `AvailabilityRule.create()` |
| AR3 | Date range rules must have start_date before end_date. | Domain logic in `AvailabilityRule.create()` and `update()` |
| AR4 | One-time rules must have a specific date. | Domain logic in `AvailabilityRule.create()` |
| AR5 | Time windows within a rule must not overlap. | Domain logic in `AvailabilityRule.addTimeWindow()` |
| AR6 | Each time window must have start_time before end_time. | Domain logic in `AvailabilityTimeWindow.create()` + DB CHECK constraint |
| AR7 | Staff availability rules must fall within the parent organization operating hours. | Use case validation (cross-aggregate check) |
| AR8 | Inactive rules are excluded from slot generation. | Slot generation algorithm filters by `is_active = true` |
| AR9 | A rule can have multiple time windows to support split-day schedules. | Domain model supports `timeWindows[]` collection |

### Exception Rules

| # | Rule | Enforcement |
|---|------|-------------|
| EX1 | Only one exception per owner per date. Creating a new one replaces the existing. | DB UNIQUE constraint on (`owner_type`, `owner_id`, `date`) + use case upsert logic |
| EX2 | Blocked exceptions have no time windows; the entire day is unavailable. | Domain logic in `AvailabilityException.create()` |
| EX3 | Special exceptions must have at least one time window. | Domain logic in `AvailabilityException.create()` |
| EX4 | Exceptions override ALL rules for their date, regardless of rule type. | Slot generation algorithm checks exceptions first |

### Slot Rules

| # | Rule | Enforcement |
|---|------|-------------|
| SL1 | `booked_spots + available_spots = capacity` must always hold. | DB CHECK constraint + domain logic in `reserve()` and `release()` |
| SL2 | Cannot reserve if no available spots remain. | Domain logic in `Slot.reserve()` |
| SL3 | Cannot release more spots than are currently booked. | Domain logic in `Slot.release()` |
| SL4 | Slot capacity is atomically updated to prevent race conditions. Use `SELECT FOR UPDATE` or optimistic locking. | Repository implementation with row-level locking |
| SL5 | Slots are regenerated (delete old + create new) when availability config changes. | Use case triggers regeneration after any config mutation |
| SL6 | Buffer time is between slots, not included in slot duration. | Slot generation algorithm: cursor advances by `duration + buffer` |
| SL7 | Individual provider slots always have capacity = 1. | Slot generation algorithm |
| SL8 | Organization slots have capacity = number of staff available at that time. | Slot generation algorithm queries staff availability |

### Scheduling Config Rules

| # | Rule | Enforcement |
|---|------|-------------|
| SC1 | Advance booking days must be between 1 and 365. | Domain logic + DB CHECK constraint |
| SC2 | Cutoff hours prevents bookings made too close to slot start time. | `GetAvailableSlots` use case filters out slots within cutoff window |
| SC3 | One scheduling config per owner (individual or organization). Staff inherit organization config. | DB UNIQUE constraint on (`owner_type`, `owner_id`) |
| SC4 | When scheduling config changes, all future slots for the owner must be regenerated. | Use case triggers full regeneration |

### Overbooking Prevention

| # | Rule | Enforcement |
|---|------|-------------|
| OB1 | Slot reservation uses row-level locking (`SELECT FOR UPDATE`) to prevent concurrent overbooking. | Repository implementation |
| OB2 | If optimistic locking is used instead, a version column and retry logic must be implemented. | Repository implementation alternative |
| OB3 | The DB CHECK constraint `booked_spots + available_spots = capacity` provides a final safety net against data corruption. | DB-level enforcement |

---

## 10. Cross-Context Dependencies

### Upstream Dependencies (Depends On)

| Source BC | What Scheduling Needs | How It Gets It |
|-----------|----------------------|----------------|
| **User** | Organization identity (organization_id) for organization availability. Staff roster (organization_member_id, user_id, is_active) to calculate slot capacity for multi-staff organizations. Staff addition/removal events to recalculate capacity. | Subscribes to `OrganizationCreated` (initialize default config), `StaffMemberAdded` (recalculate capacity), `StaffMemberRemoved` (recalculate capacity). Queries User BC read models for staff details. |
| **Catalog** | Service `duration_minutes` and `buffer_minutes` for slot generation. Service `provider_type` and owner identity to determine slot ownership. Service publication status to trigger/pause slot generation. | Subscribes to `ServicePublished` (trigger slot generation), `ServiceUnpublished` (pause generation, keep existing slots), `ServiceArchived` (stop generation, clean up future slots). Queries Catalog BC read models for service details. |

### Downstream Dependents (Depended On By)

| Consuming BC | What It Needs | How It Gets It |
|-------------|---------------|----------------|
| **Booking** | Available slots for a service on a given date. Slot reservation and release operations for booking lifecycle. | Queries Scheduling BC for available slots via `GetAvailableSlots`. Calls `ReserveSlotCapacity` when a booking is confirmed. Calls `ReleaseSlotCapacity` when a booking is cancelled or expires. Consumes `SlotsRegenerated` to validate existing bookings. |

### Events Published

| Event | Consumers |
|-------|-----------|
| `SlotsRegenerated` | Booking BC (validate existing bookings in affected range) |
| `SlotReserved` | Booking BC (confirm reservation), Communication BC (notify provider) |
| `SlotReleased` | Booking BC (confirm release), Communication BC (notify waiting list) |

### Events Subscribed

| Event | Source BC | Handler |
|-------|----------|---------|
| `OrganizationCreated` | User | Initialize default SchedulingConfig for the new organization (30-day window, 2h cutoff, 0 buffer, timezone from organization location). |
| `StaffMemberAdded` | User | Recalculate slot capacity for all future organization slots. More staff means higher concurrent capacity. Trigger partial slot regeneration. |
| `StaffMemberRemoved` | User | Recalculate slot capacity for all future organization slots. Fewer staff means lower concurrent capacity. Trigger partial slot regeneration. Deactivate the removed staff member's individual availability rules. |
| `ServicePublished` | Catalog | Trigger initial slot generation for the service using its `duration_minutes` and `buffer_minutes` within the owner's advance booking window. |
| `ServiceUnpublished` | Catalog | Pause slot generation for this service. Keep existing slots and bookings intact. Do not generate new slots. |
| `ServiceArchived` | Catalog | Stop slot generation. Delete all future unbooked slots for this service. Existing booked slots remain until their bookings are completed or cancelled. |
| `BookingConfirmed` | Booking | Call `ReserveSlotCapacity` to atomically reserve a spot on the booked slot. |
| `BookingCancelled` | Booking | Call `ReleaseSlotCapacity` to atomically release the spot on the booked slot. |
| `BookingExpired` | Booking | Call `ReleaseSlotCapacity` to atomically release the spot on the expired booking's slot. |

### Integration Pattern

The Scheduling BC uses the **Conformist** pattern upstream: it conforms to User BC's model for organization and staff identity, and to Catalog BC's model for service duration and buffer. Downstream, it uses the **Published Language** pattern, exposing well-defined slot query interfaces and domain events that the Booking BC consumes. The Booking BC never writes directly to Scheduling's data store; it invokes Scheduling use cases through defined ports (ReserveSlotCapacity, ReleaseSlotCapacity).
