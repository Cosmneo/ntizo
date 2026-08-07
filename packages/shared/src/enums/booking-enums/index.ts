export type BookingPath =
  | "package"       // A — fixed-price package
  | "hourly"        // B — hourly booking
  | "custom_quote"  // C — customer requests quote
  | "task_bid";     // D — customer posts task, providers bid

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed";

export type ServiceLocationType =
  | "at_customer"
  | "at_provider"
  | "remote"
  | "flexible";
