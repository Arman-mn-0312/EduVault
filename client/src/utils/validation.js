const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;

export function validateEmail(value) {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address.';
  return null;
}

export function validateFullName(value) {
  const v = value.trim();
  if (!v) return 'Enter your full name.';
  if (v.length > 100) return 'Full name must be 100 characters or fewer.';
  return null;
}

export function validateNewPassword(value) {
  if (!value) return 'Enter a password.';
  if (value.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  return null;
}

/** Translate Supabase Auth errors into plain, actionable messages. */
export function friendlyAuthError(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (msg.includes('email not confirmed')) return 'Confirm your email first. Check your inbox for the confirmation link.';
  if (msg.includes('already registered')) return 'An account with this email already exists. Try logging in.';
  if (msg.includes('rate limit') || error?.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  if (msg.includes('password') && msg.includes('weak')) return 'Choose a stronger password.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Cannot reach the sign-in service. Check your connection.';
  return error?.message || 'Something went wrong. Try again.';
}
