import { AppError } from '../utils/AppError.js';
import * as profilesRepository from '../repositories/profilesRepository.js';

function readBearerToken(req) {
  const [scheme, token, ...rest] = (req.get('authorization') || '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length) return null;
  return token;
}

/**
 * authenticate: verifies the Supabase JWT, then loads the caller's profile from the database.
 * The role comes from public.profiles ONLY. JWT user_metadata is user-editable and is never trusted.
 * Sets req.auth = { token, user, profile, db } where db is a user-scoped (RLS) client.
 */
export function createAuthMiddleware({ supabase }) {
  async function authenticate(req, _res, next) {
    const token = readBearerToken(req);
    if (!token) throw AppError.unauthorized();
    if (!supabase.isConfigured) {
      throw AppError.unavailable('Authentication is not configured on the server.');
    }

    const user = await supabase.verifyToken(token);
    if (!user) throw AppError.unauthorized('Your session is invalid or has expired. Sign in again.');

    const db = supabase.userClient(token);
    const { data: profile, error } = await profilesRepository.getById(db, user.id);
    if (error) throw new Error(`profile lookup failed: ${error.message}`); // -> generic 500, logged server-side
    if (!profile) throw AppError.forbidden('No profile exists for this account.');
    if (profile.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Contact an administrator.');
    }

    req.auth = { token, user: { id: user.id, email: user.email }, profile, db };
    next();
  }

  return { authenticate };
}

/** Server-side role gate. Must run after authenticate. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.profile.role)) return next(AppError.forbidden());
    return next();
  };
}
