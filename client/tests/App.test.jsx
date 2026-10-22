import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import App from '../src/App.jsx';
import { resetAuth } from './supabaseMock.js';
import { installFetch, jsonRes, renderWithProviders } from './utils.jsx';

vi.mock('../src/services/supabase.js', async () => (await import('./supabaseMock.js')).moduleMock);

const renderAt = (path) => renderWithProviders(<App />, { path });

describe('public routes', () => {
  beforeEach(() => resetAuth());
  afterEach(() => vi.unstubAllGlobals());

  it('renders the landing page and shows live server status', async () => {
    installFetch(() => jsonRes(200, { status: 'ok', supabase: { configured: false } }));
    renderAt('/');
    expect(screen.getByRole('link', { name: 'EduVault' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/slides and notes/i);
    expect(await screen.findByText(/server is online/i)).toBeInTheDocument();
    expect(screen.getByText(/not configured yet/i)).toBeInTheDocument();
    // header nav + hero call-to-action
    expect(await screen.findAllByRole('link', { name: /^log in$/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /register|create an account/i }).length).toBe(2);
  });

  it('shows an error state with retry when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    renderAt('/');
    expect(await screen.findByText(/cannot reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders Not Found and Access Denied pages', async () => {
    renderAt('/does-not-exist');
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });

  it('renders the Access Denied page', async () => {
    renderAt('/access-denied');
    expect(await screen.findByRole('heading', { name: /access denied/i })).toBeInTheDocument();
  });
});
