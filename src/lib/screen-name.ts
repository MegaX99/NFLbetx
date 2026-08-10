export const SCREEN_NAME_MIN_LENGTH = 3;
export const SCREEN_NAME_MAX_LENGTH = 24;

const allowedScreenName = /^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9]$/;
const reservedScreenNames = new Set(["admin", "administrator", "nflbetx", "support", "system"]);

export function normalizeScreenName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateScreenName(value: string) {
  const screenName = normalizeScreenName(value);

  if (screenName.length < SCREEN_NAME_MIN_LENGTH || screenName.length > SCREEN_NAME_MAX_LENGTH) {
    return `Use ${SCREEN_NAME_MIN_LENGTH} to ${SCREEN_NAME_MAX_LENGTH} characters.`;
  }

  if (!allowedScreenName.test(screenName)) {
    return "Use letters, numbers, spaces, periods, underscores, or hyphens. Start and end with a letter or number.";
  }

  if (reservedScreenNames.has(screenName.toLowerCase())) {
    return "That screen name is reserved. Please choose another.";
  }

  return "";
}

export function screenNameError(error: { code?: string; message?: string } | null) {
  if (error?.code === "23505") return "That screen name is already taken. Try another.";
  if (error?.code === "23514") return "That screen name does not meet the requirements.";
  return "We could not save your screen name. Please try again.";
}

