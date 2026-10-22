import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import AuthCard, { FormError, SubmitButton } from '../components/AuthCard.jsx';
import FormField from '../components/FormField.jsx';
import { HOME_ROUTE } from '../utils/routes.js';
import { friendlyAuthError, validateNewPassword } from '../utils/validation.js';

/** Reached from the emailed link. Supabase turns the link into a short-lived recovery session. */
export default function ResetPassword() {
  const { session, loading, updatePassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <AuthCard title="Reset your password"><p className="text-slate-600">Checking your link…</p></AuthCard>;

  if (!session) {
    return (
      <AuthCard title="Link expired">
        <p className="text-slate-700">This reset link is invalid or has expired.</p>
        <Link to="/forgot-password" className="mt-4 inline-block font-medium text-indigo-700 hover:underline">Request a new link</Link>
      </AuthCard>
    );
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    const next = {
      password: validateNewPassword(form.password),
      confirm: form.confirm !== form.password ? 'Passwords do not match.' : null,
    };
    setErrors(next);
    setFormError('');
    if (next.password || next.confirm) return;
    setBusy(true);
    try {
      await updatePassword(form.password);
      toast.success('Password updated.');
      navigate(HOME_ROUTE, { replace: true });
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={formError} />
        <FormField label="New password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <FormField label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        <SubmitButton busy={busy}>Update password</SubmitButton>
      </form>
    </AuthCard>
  );
}
