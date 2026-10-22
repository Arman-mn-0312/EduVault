import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import App from '../src/App.jsx';
import { AdminRoute } from '../src/components/RouteGuards.jsx';
import AccessDenied from '../src/pages/AccessDenied.jsx';
import { mockAuth, resetAuth, sessionFor } from './supabaseMock.js';
import { installFetch, jsonRes, profileRow, renderWithProviders } from './utils.jsx';

vi.mock('../src/services/supabase.js', async () => (await import('./supabaseMock.js')).moduleMock);

const renderAt = (path) => renderWithProviders(<App />, { path });
afterEach(() => vi.unstubAllGlobals());

describe('route protection', () => {
  it('sends signed-out visitors from /profile to the login page', async () => {
    resetAuth();
    installFetch(() => jsonRes(200, {}));
    renderAt('/profile');
    expect(await screen.findByRole('heading', { name: /log in/i })).toBeInTheDocument();
  });

  it('shows the profile to a signed-in student and sends the bearer token', async () => {
    resetAuth({ session: sessionFor('u1') });
    const fetchMock = installFetch(() => jsonRes(200, { profile: profileRow() }));
    renderAt('/profile');
    expect(await screen.findByRole('heading', { name: /your profile/i })).toBeInTheDocument();
    expect(screen.getByText('u1@uni.test')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-u1');
  });

  it('shows a retry panel instead of redirecting when the API is down', async () => {
    resetAuth({ session: sessionFor('u1') });
    installFetch(() => { throw new TypeError('fetch failed'); });
    renderAt('/profile');
    expect(await screen.findByText(/could not load your account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('signs out an account the server reports as suspended', async () => {
    resetAuth({ session: sessionFor('u1') });
    installFetch(() => jsonRes(403, { error: { code: 'ACCOUNT_SUSPENDED', message: 'suspended' } }));
    renderAt('/profile');
    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalled());
  });

  function renderAdminRoute(role) {
    resetAuth({ session: sessionFor('u1') });
    installFetch(() => jsonRes(200, { profile: profileRow({ role }) }));
    return renderWithProviders(
      <Routes>
        <Route element={<AdminRoute />}><Route path="/admin" element={<h1>Admin secret</h1>} /></Route>
        <Route path="/access-denied" element={<AccessDenied />} />
      </Routes>,
      { path: '/admin' }
    );
  }

  it('AdminRoute lets admins in', async () => {
    renderAdminRoute('admin');
    expect(await screen.findByRole('heading', { name: /admin secret/i })).toBeInTheDocument();
  });

  it('AdminRoute sends students to Access Denied', async () => {
    renderAdminRoute('student');
    expect(await screen.findByRole('heading', { name: /access denied/i })).toBeInTheDocument();
    expect(screen.queryByText(/admin secret/i)).not.toBeInTheDocument();
  });
});

describe('login', () => {
  beforeEach(() => { resetAuth(); installFetch(() => jsonRes(200, {})); });

  it('validates before calling Supabase', async () => {
    renderAt('/login');
    await userEvent.click(await screen.findByRole('button', { name: /^log in$/i }));
    expect(await screen.findByText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('submits trimmed credentials', async () => {
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), '  a@uni.test ');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    await waitFor(() => expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@uni.test', password: 'secret-pass' }));
  });

  it('shows a friendly message for wrong credentials', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@uni.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'nope');
    await userEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/email or password is incorrect/i);
  });
});

describe('registration', () => {
  beforeEach(() => { resetAuth(); installFetch(() => jsonRes(200, {})); });

  async function fill({ name = 'Alice Student', email = 'alice@uni.test', password = 'longenough1', confirm = 'longenough1' } = {}) {
    await userEvent.type(await screen.findByLabelText(/full name/i), name);
    await userEvent.type(screen.getByLabelText(/^email/i), email);
    await userEvent.type(screen.getByLabelText(/^password/i), password);
    await userEvent.type(screen.getByLabelText(/confirm password/i), confirm);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
  }

  it('rejects short passwords and mismatches without calling Supabase', async () => {
    renderAt('/register');
    await fill({ password: 'short', confirm: 'different' });
    expect(await screen.findByText(/use at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });

  it('sends only the display name as metadata (never a role) and prompts for email confirmation', async () => {
    renderAt('/register');
    await fill();
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    const arg = mockAuth.signUp.mock.calls[0][0];
    expect(arg.options.data).toEqual({ full_name: 'Alice Student' });
    expect(JSON.stringify(arg)).not.toMatch(/role|admin/i);
  });

  it('shows Supabase errors in plain language', async () => {
    mockAuth.signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered' } });
    renderAt('/register');
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});

describe('password reset', () => {
  beforeEach(() => { resetAuth(); installFetch(() => jsonRes(200, {})); });

  it('requests a reset link and shows a neutral confirmation', async () => {
    renderAt('/forgot-password');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@uni.test');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
    expect(mockAuth.resetPasswordForEmail.mock.calls[0][0]).toBe('a@uni.test');
  });

  it('tells visitors without a recovery session that the link is invalid', async () => {
    renderAt('/reset-password');
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
  });

  it('lets a recovery session set a new password', async () => {
    resetAuth({ session: sessionFor('u1') });
    installFetch(() => jsonRes(200, { profile: profileRow() }));
    renderAt('/reset-password');
    await userEvent.type(await screen.findByLabelText(/^new password/i), 'brand-new-pass');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'brand-new-pass');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'brand-new-pass' }));
  });
});

describe('profile management', () => {
  it('PATCHes exactly { fullName } and updates the display', async () => {
    resetAuth({ session: sessionFor('u1') });
    const fetchMock = installFetch(({ method, body }) =>
      method === 'PATCH' ? jsonRes(200, { profile: profileRow({ fullName: body.fullName }) }) : jsonRes(200, { profile: profileRow() })
    );
    renderAt('/profile');
    const input = await screen.findByLabelText(/full name/i);
    await userEvent.clear(input);
    await userEvent.type(input, '  Alice Brown ');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(JSON.parse(patch[1].body)).toEqual({ fullName: 'Alice Brown' });
    });
    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
  });

  it('blocks an empty name locally', async () => {
    resetAuth({ session: sessionFor('u1') });
    const fetchMock = installFetch(() => jsonRes(200, { profile: profileRow() }));
    renderAt('/profile');
    const input = await screen.findByLabelText(/full name/i);
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('logs out through Supabase', async () => {
    resetAuth({ session: sessionFor('u1') });
    installFetch(() => jsonRes(200, { profile: profileRow() }));
    renderAt('/profile');
    const buttons = await screen.findAllByRole('button', { name: /log out/i });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalled());
  });
});
