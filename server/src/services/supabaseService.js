import { createClient } from '@supabase/supabase-js';
import { AppError } from '../utils/AppError.js';

const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

/**
 * The only module that creates Supabase clients on the server.
 *  - verifyToken(jwt): asks Supabase Auth whether a token is valid (signature + expiry + revocation).
 *  - userClient(jwt):  client that acts AS the user, so Postgres RLS applies. Default for data access.
 *  - adminClient():    service-role client. Bypasses RLS. Only for trusted backend operations
 *                      (storage writes, signed URLs, admin mutations, audit rows, record_download).
 * Clients are created lazily, so the server boots without credentials.
 */
export function createSupabaseService(config) {
  const { url, publishableKey, secretKey, isConfigured, hasServiceRole } = config.supabase;
  let anon;
  let admin;

  const getAnon = () => {
    if (!isConfigured) throw AppError.unavailable('Authentication is not configured on the server.');
    return (anon ??= createClient(url, publishableKey, CLIENT_OPTIONS));
  };

  return {
    isConfigured,
    hasServiceRole,

    async verifyToken(token) {
      const { data, error } = await getAnon().auth.getUser(token);
      if (error) {
        const upstreamDown = error.status >= 500 || error.name === 'AuthRetryableFetchError';
        if (upstreamDown) {
          throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication service is unavailable. Try again shortly.');
        }
        return null;
      }
      return data?.user ?? null;
    },

    userClient(token) {
      if (!isConfigured) throw AppError.unavailable('Authentication is not configured on the server.');
      return createClient(url, publishableKey, {
        ...CLIENT_OPTIONS,
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    },

    adminClient() {
      if (!hasServiceRole) {
        throw AppError.unavailable('Privileged operations are not configured on the server.');
      }
      return (admin ??= createClient(url, secretKey, CLIENT_OPTIONS));
    },
  };
}
