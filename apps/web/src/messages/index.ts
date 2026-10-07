import { en, type Messages } from "./en";

/** Returns the message catalog. English only in v1; locale selection slots in here. */
export function getMessages(): Messages {
  return en;
}
