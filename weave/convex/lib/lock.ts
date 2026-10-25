import { ConvexError } from "convex/values";

/**
 * Shared lock for anything that spends credits or edits shared data. The password lives only in the
 * Convex env (REFRESH_PASSWORD). It fails closed: if the env var is missing, nothing unlocks.
 */
export function isUnlocked(password: string | undefined): boolean {
  const expected = process.env.REFRESH_PASSWORD;
  return !!expected && password === expected;
}

/** Throws `ConvexError({ locked: true })`, which the UI's password gate turns into a prompt. */
export function assertUnlocked(password: string | undefined): void {
  if (!isUnlocked(password)) throw new ConvexError({ locked: true });
}
