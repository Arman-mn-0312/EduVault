import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthCard, { FormError, SubmitButton } from '../components/AuthCard.jsx';
import FormField from '../components/FormField.jsx';
import { friendlyAuthError, validateEmail } from '../utils/validation.js';
import { safeRedirectPath } from '../utils/routes.js';

export default function Login() {
  const { session, loading, notice, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const target = safeRedirectPath(location.state?.from?.pathname);
  if (!loading && session) return <Navigate to={target} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    const next = {
      email: validateEmail(form.email),
      password: form.password ? null : 'Enter your password.',
    };
    setErrors(next);
    setFormError('');
    if (next.email || next.password) return;

    setBusy(true);
    try {
      await signIn(form);
      navigate(target, { replace: true });
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Log in" subtitle="Welcome back. Log in to search, upload, and download study material.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={notice || formError} />
        <FormField label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <FormField label="Password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} error={errors.password} />
        <SubmitButton busy={busy}>Log in</SubmitButton>
      </form>
      <div className="mt-5 flex flex-col gap-2 text-sm text-slate-600">
        <Link to="/forgot-password" className="font-medium text-indigo-700 hover:underline">Forgot your password?</Link>
        <p>New here? <Link to="/register" className="font-medium text-indigo-700 hover:underline">Create an account</Link></p>
      </div>
    </AuthCard>
  );
}
