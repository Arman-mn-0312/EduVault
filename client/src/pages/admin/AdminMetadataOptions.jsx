import { useEffect, useState } from 'react';
import { createAdminMetadataOption, deactivateAdminMetadataOption, getAdminMetadataOptions, updateAdminMetadataOption } from '../../services/api.js';

const fields = [
  ['field_discipline', 'Field / Discipline'],
  ['course_program', 'Course / Program'],
  ['semester_study_year', 'Semester / Study year'],
  ['subject', 'Subject'],
  ['document_type', 'Document type'],
  ['academic_year', 'Academic year'],
  ['college_university', 'College / University'],
];

export default function AdminMetadataOptions() {
  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState('');
  const [fieldKey, setFieldKey] = useState(fields[0][0]);
  const [form, setForm] = useState({ value: '', label: '', sortOrder: 0 });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    getAdminMetadataOptions({ includeInactive: true, q: query }).then((result) => setOptions(result.options || [])).catch((err) => setError(err.message));
  }
  useEffect(load, [query]);

  async function create(event) {
    event.preventDefault();
    setError('');
    try {
      await createAdminMetadataOption({ fieldKey, ...form, sortOrder: Number(form.sortOrder) });
      setForm({ value: '', label: '', sortOrder: 0 });
      setMessage('Metadata option created.');
      load();
    } catch (err) { setError(err.message); }
  }

  async function edit(option) {
    const label = window.prompt('Display label', option.label);
    if (label === null) return;
    try { await updateAdminMetadataOption(option.id, { label }); setMessage('Metadata option updated.'); load(); } catch (err) { setError(err.message); }
  }

  async function toggle(option) {
    try { await updateAdminMetadataOption(option.id, { isActive: !option.isActive }); setMessage(option.isActive ? 'Metadata option deactivated.' : 'Metadata option reactivated.'); load(); } catch (err) { setError(err.message); }
  }

  async function reorder(option) {
    const sortOrder = window.prompt('Sort order', String(option.sortOrder));
    if (sortOrder === null) return;
    try { await updateAdminMetadataOption(option.id, { sortOrder: Number(sortOrder) }); setMessage('Metadata option reordered.'); load(); } catch (err) { setError(err.message); }
  }

  return <div>
    <h2 className="text-2xl font-bold">Metadata options</h2>
    <p className="mt-2 text-sm text-slate-600">Manage selectable values only. The ten fixed EduVault metadata fields cannot be deleted, hidden, or changed here.</p>
    <input aria-label="Search metadata options" placeholder="Search options" className="mt-5 w-full rounded-lg border p-2" value={query} onChange={(event) => setQuery(event.target.value)} />
    <form onSubmit={create} className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <select aria-label="Metadata field" className="rounded-lg border p-2" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)}>{fields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input required aria-label="Option value" placeholder="Stable value" className="rounded-lg border p-2" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
      <input required aria-label="Option label" placeholder="Display label" className="rounded-lg border p-2" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      <button className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white">Add option</button>
    </form>
    {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="mt-5 overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3">Field</th><th className="p-3">Value</th><th className="p-3">Label</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
        <tbody>{options.map((option) => <tr key={option.id} className="border-b last:border-0"><td className="p-3">{fields.find(([key]) => key === option.fieldKey)?.[1] || option.fieldKey}</td><td className="p-3">{option.value}</td><td className="p-3">{option.label}</td><td className="p-3">{option.isActive ? 'Active' : 'Inactive'}</td><td className="space-x-3 p-3"><button type="button" className="text-indigo-700" onClick={() => edit(option)}>Edit</button><button type="button" className="text-indigo-700" onClick={() => reorder(option)}>Reorder</button><button type="button" className="text-amber-700" onClick={() => toggle(option)}>{option.isActive ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody>
      </table>
      {!options.length && <p className="p-5 text-slate-500">No options configured yet.</p>}
    </div>
  </div>;
}
