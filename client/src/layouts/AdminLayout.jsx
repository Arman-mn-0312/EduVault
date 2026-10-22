import { Link, Outlet, useLocation } from 'react-router-dom';

const links = [
  ['/admin', 'Dashboard'],
  ['/admin/users', 'Users'],
  ['/admin/documents', 'Documents'],
  ['/admin/reports', 'Reports'],
  ['/admin/audit-logs', 'Audit logs'],
  ['/admin/metadata-options', 'Metadata options'],
];

export default function AdminLayout() {
  const location = useLocation();
  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:w-56">
        <h1 className="px-3 text-lg font-bold text-slate-900">EduVault Admin</h1>
        <nav aria-label="Admin navigation" className="mt-4 space-y-1">
          {links.map(([path, label]) => <Link key={path} to={path} className={`block rounded-lg px-3 py-2 text-sm font-medium ${location.pathname === path ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</Link>)}
        </nav>
      </aside>
      <section className="min-w-0 flex-1"><Outlet /></section>
    </div>
  );
}
