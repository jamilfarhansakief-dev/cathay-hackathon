import { Timestamp } from "firebase/firestore";

// Change these to adjust when chats are available
export const CHAT_OPENS_HOURS_BEFORE_DEPARTURE = 72;
export const CHAT_CLOSES_HOURS_AFTER_LANDING = 48;

const HOUR_MS = 60 * 60 * 1000;

export type ChatWindowStatus = "not_open_yet" | "open" | "closed";

export function getChatWindow(
  departureTime: Timestamp,
  landingTime: Timestamp,
  now: Date = new Date()
) {
  const opensAt = new Date(
    departureTime.toMillis() - CHAT_OPENS_HOURS_BEFORE_DEPARTURE * HOUR_MS
  );
  const closesAt = new Date(
    landingTime.toMillis() + CHAT_CLOSES_HOURS_AFTER_LANDING * HOUR_MS
  );

  let status: ChatWindowStatus = "open";
  if (now < opensAt) status = "not_open_yet";
  else if (now > closesAt) status = "closed";

  return { status, opensAt, closesAt };
}