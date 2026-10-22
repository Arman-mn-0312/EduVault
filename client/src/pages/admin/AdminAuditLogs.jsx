import { useEffect, useState } from 'react';
import { getAdminAuditLogs } from '../../services/api.js';

export default function AdminAuditLogs() {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { getAdminAuditLogs({ page: 1, limit: 50 }).then(setData).catch((err) => setError(err.message)); }, []);
  return <div><h2 className="text-2xl font-bold">Audit logs</h2>{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}<div className="mt-5 overflow-x-auto rounded-xl border bg-white">{data ? <table className="w-full text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Details</th></tr></thead><tbody>{data.items.map((log) => <tr key={log.id} className="border-b last:border-0"><td className="p-3">{new Date(log.createdAt).toLocaleString()}</td><td className="p-3">{log.actorName}</td><td className="p-3">{log.action}</td><td className="p-3">{log.targetType} {log.targetId}</td><td className="p-3">{JSON.stringify(log.details)}</td></tr>)}</tbody></table> : <p role="status" className="p-5">Loading audit logs…</p>}</div></div>;
}
