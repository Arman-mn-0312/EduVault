import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { ToastProvider } from '../src/components/Toast.jsx';

export const jsonRes = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

export const profileRow = (over = {}) => ({
  id: 'u1', fullName: 'Alice Student', email: 'u1@uni.test', role: 'student', status: 'active', createdAt: '2026-01-02T00:00:00Z', ...over,
});

/** Installs a fetch mock. handler({ url, method, body }) returns a response from jsonRes(). */
export function installFetch(handler) {
  const fn = vi.fn(async (url, init = {}) =>
    handler({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers || {} })
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderWithProviders(ui, { path = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}
