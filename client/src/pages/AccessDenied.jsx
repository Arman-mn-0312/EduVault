import { Link } from 'react-router-dom';

export default function AccessDenied() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-bold text-slate-900">Access denied</h1>
      <p className="mt-3 text-slate-600">Your account does not have permission to view this page.</p>
      <Link to="/" className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">
        Back to home
      </Link>
    </div>
  );
}
