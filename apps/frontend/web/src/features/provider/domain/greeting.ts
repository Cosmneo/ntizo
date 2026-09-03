export type GreetingKey = "morning" | "afternoon" | "evening";

/** The reader's own clock, not the workspace's: this is a hello, not a booking. */
export function greetingKey(now: Date): GreetingKey {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 19) return "afternoon";
  return "evening";
}
