import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import AuthCard, { FormError, SubmitButton } from '../components/AuthCard.jsx';
import FormField from '../components/FormField.jsx';
import { HOME_ROUTE } from '../utils/routes.js';
import { PASSWORD_MIN_LENGTH, friendlyAuthError, validateEmail, validateFullName, validateNewPassword } from '../utils/validation.js';

export default function Register() {
  const { session, loading, signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEmailFor, setConfirmEmailFor] = useState(null);

  if (!loading && session) return <Navigate to={HOME_ROUTE} replace />;

  if (confirmEmailFor) {
    return (
      <AuthCard title="Check your email">
        <div className="text-center">
          <MailCheck className="mx-auto h-10 w-10 text-indigo-600" aria-hidden="true" />
          <p className="mt-3 text-slate-700">
            We sent a confirmation link to <strong>{confirmEmailFor}</strong>. Open it to activate your account, then log in.
          </p>
          <Link to="/login" className="mt-5 inline-block font-medium text-indigo-700 hover:underline">Go to log in</Link>
        </div>
      </AuthCard>
    );
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    const next = {
      fullName: validateFullName(form.fullName),
      email: validateEmail(form.email),
      password: validateNewPassword(form.password),
      confirm: form.confirm !== form.password ? 'Passwords do not match.' : null,
    };
    setErrors(next);
    setFormError('');
    if (Object.values(next).some(Boolean)) return;

    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signUp(form);
      if (needsEmailConfirmation) setConfirmEmailFor(form.email.trim());
      else navigate(HOME_ROUTE, { replace: true });
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="Share study material and find what classmates have uploaded.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={formError} />
        <FormField label="Full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
        <FormField label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <FormField label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} />
        <FormField label="Confirm password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
      <p className="mt-5 text-sm text-slate-600">
        Already registered? <Link to="/login" className="font-medium text-indigo-700 hover:underline">Log in</Link>
      </p>
    </AuthCard>
  );
}
