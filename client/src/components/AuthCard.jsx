import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function AuthCard({ title, subtitle, children }) {
  const { isConfigured } = useAuth();
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      {!isConfigured && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Sign-in is unavailable because Supabase is not configured. See the README setup steps.
        </p>
      )}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function SubmitButton({ busy, children, ...props }) {
  const { isConfigured } = useAuth();
  return (
    <button
      type="submit"
      disabled={busy || !isConfigured}
      className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      {...props}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>;
}
