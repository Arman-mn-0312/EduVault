import { CheckCircle2, Loader2, RefreshCw, ServerCrash } from 'lucide-react';
import { useApiHealth } from '../hooks/useApiHealth.js';

export default function ServerStatus() {
  const { status, data, error, retry } = useApiHealth();

  return (
    <section aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Server connection</h2>

      {status === 'checking' && (
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking the server…
        </p>
      )}

      {status === 'waking' && (
        <p className="mt-2 flex items-center gap-2 text-sm text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          The server is waking up after being idle. This can take up to a minute.
        </p>
      )}

      {status === 'online' && (
        <div className="mt-2 text-sm text-slate-600">
          <p className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Server is online
          </p>
          <p className="mt-1">
            Database and storage:{' '}
            {data.supabase.configured ? 'connected to Supabase' : 'not configured yet (see README setup)'}
          </p>
        </div>
      )}

      {status === 'offline' && (
        <div className="mt-2 text-sm">
          <p className="flex items-center gap-2 text-red-700">
            <ServerCrash className="h-4 w-4" aria-hidden="true" /> {error}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      )}
    </section>
  );
}
