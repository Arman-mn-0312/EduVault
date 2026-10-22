import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2, ServerCrash } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

function Spinner() {
  return (
    <div className="flex justify-center py-24" role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-hidden="true" />
    </div>
  );
}

/**
 * UX guard only. It keeps signed-out users away from private pages, but real protection is
 * server-side: every API route verifies the token and role itself.
 */
export function ProtectedRoute() {
  const { loading, session, profile, profileError, retryProfile } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!profile) {
    return (
      <div className="py-16 text-center">
        <ServerCrash className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">We could not load your account</h1>
        <p className="mt-2 text-slate-600">{profileError || 'Try again in a moment.'}</p>
        <button type="button" onClick={retryProfile} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">
          Try again
        </button>
      </div>
    );
  }
  return <Outlet />;
}

/** Admin-only pages. Must be nested inside (or equivalent to) ProtectedRoute behavior. */
export function AdminRoute() {
  const { loading, session, profile, profileError, retryProfile } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!profile) {
    return (
      <div className="py-16 text-center">
        <ServerCrash className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">We could not load your account</h1>
        <p className="mt-2 text-slate-600">{profileError || 'Try again in a moment.'}</p>
        <button type="button" onClick={retryProfile} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">
          Try again
        </button>
      </div>
    );
  }
  if (profile?.role !== 'admin') return <Navigate to="/access-denied" replace />;
  return <Outlet />;
}
