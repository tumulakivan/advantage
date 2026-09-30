/** Matches the server's `minPasswordLength`, which is what actually enforces it. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * What is wrong with a new password, per field.
 *
 * Checked in the browser so the answer is immediate and specific, but the
 * length rule is only a courtesy here: the server refuses a short password
 * regardless of what this says, so nothing depends on this being bypass-proof.
 * Sign-in is never checked this way - it has to accept whatever the account
 * was created with, including from before a rule existed.
 *
 * Shared by sign-up and password reset so the two cannot drift into asking for
 * different things.
 */
export function checkNewPassword(password: string, confirm: string) {
  return {
    password:
      password.length < MIN_PASSWORD_LENGTH
        ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        : null,
    confirm: confirm !== password ? "Passwords do not match." : null,
  };
}
