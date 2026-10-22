import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import FormField from '../components/FormField.jsx';
import { FormError } from '../components/AuthCard.jsx';
import { validateFullName } from '../utils/validation.js';

export default function Profile() {
  const { profile, updateFullName, signOut } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState(profile.fullName);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setFullName(profile.fullName), [profile.fullName]);

  async function onSubmit(e) {
    e.preventDefault();
    const problem = validateFullName(fullName);
    setError(problem || '');
    setFormError('');
    if (problem) return;
    setBusy(true);
    try {
      await updateFullName(fullName.trim());
      toast.success('Profile updated.');
    } catch (err) {
      setFormError(err.message);
      toast.error('Could not update your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-slate-900">Your profile</h1>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <dt className="text-slate-500">Email</dt><dd className="text-slate-900">{profile.email}</dd>
        <dt className="text-slate-500">Role</dt><dd className="text-slate-900 capitalize">{profile.role}</dd>
        <dt className="text-slate-500">Member since</dt>
        <dd className="text-slate-900">{new Date(profile.createdAt).toLocaleDateString()}</dd>
      </dl>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <FormError message={formError} />
        <FormField label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={error} hint="Shown next to documents you upload." />
        <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <button type="button" onClick={signOut} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">
        <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
      </button>
    </div>
  );
}
