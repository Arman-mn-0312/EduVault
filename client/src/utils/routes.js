/** Where signed-in users land by default. Phase 5 switches this to the student dashboard. */
export const HOME_ROUTE = '/profile';

/** Only allow same-site relative paths as post-login redirect targets. */
export function safeRedirectPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : HOME_ROUTE;
}
