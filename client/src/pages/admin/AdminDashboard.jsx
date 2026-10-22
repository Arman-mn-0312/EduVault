import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminOverview } from '../../services/api.js';

const cards = [['students', 'Students'], ['documents', 'Documents'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['downloads', 'Downloads']];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getAdminOverview().then(setData).catch((err) => setError(err.message)); }, []);
  if (error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>;
  if (!data) return <p role="status" className="text-slate-600">Loading dashboard…</p>;
  return <div><h2 className="text-2xl font-bold text-slate-900">Dashboard</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([key, label]) => <div key={key} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{data.stats[key]}</p></div>)}</div>
    <div className="mt-8 grid gap-6 xl:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Recent uploads</h3>{data.recentUploads.length ? <ul className="mt-3 space-y-3">{data.recentUploads.map((item) => <li key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.title}<span className="block text-xs text-slate-500">{item.uploader?.full_name || 'Unknown'} · {item.status}</span></span><span className="text-slate-500">{new Date(item.created_at).toLocaleDateString()}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No uploads yet.</p>}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Most downloaded</h3>{data.mostDownloaded.length ? <ul className="mt-3 space-y-3">{data.mostDownloaded.map((item) => <li key={item.id} className="flex justify-between gap-3 text-sm"><Link to={`/documents/${item.id}`} className="text-indigo-700 hover:underline">{item.title}</Link><span className="text-slate-500">{item.download_count} downloads</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No downloads yet.</p>}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-2"><h3 className="font-semibold">Reports requiring attention</h3>{data.recentReports.length ? <ul className="mt-3 space-y-3">{data.recentReports.map((item) => <li key={item.id} className="text-sm"><Link to="/admin/reports" className="text-indigo-700 hover:underline">{item.document?.title || 'Unknown document'}</Link><span className="ml-2 text-slate-500">{item.reason} · {item.reporter?.full_name || 'Unknown'}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No open reports.</p>}</section></div></div>;
}
