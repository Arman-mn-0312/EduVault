import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import AuthCard, { FormError, SubmitButton } from '../components/AuthCard.jsx';
import FormField from '../components/FormField.jsx';
import { friendlyAuthError, validateEmail } from '../utils/validation.js';

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const problem = validateEmail(email);
    setError(problem || '');
    setFormError('');
    if (problem) return;
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <div className="text-center">
          <MailCheck className="mx-auto h-10 w-10 text-indigo-600" aria-hidden="true" />
          {/* Same message whether or not the account exists, so emails cannot be enumerated. */}
          <p className="mt-3 text-slate-700">If an account exists for that address, a password reset link is on its way.</p>
          <Link to="/login" className="mt-5 inline-block font-medium text-indigo-700 hover:underline">Back to log in</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter your email and we will send you a reset link.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={formError} />
        <FormField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <SubmitButton busy={busy}>Send reset link</SubmitButton>
      </form>
      <p className="mt-5 text-sm"><Link to="/login" className="font-medium text-indigo-700 hover:underline">Back to log in</Link></p>
    </AuthCard>
  );
}
