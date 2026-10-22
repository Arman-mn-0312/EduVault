import { vi } from 'vitest';

export const mockAuth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
};

/** Use as: vi.mock('../src/services/supabase.js', async () => (await import('./supabaseMock.js')).moduleMock) */
export const moduleMock = { supabase: { auth: mockAuth }, isSupabaseConfigured: true };

export const sessionFor = (id = 'u1') => ({ access_token: `token-${id}`, user: { id, email: `${id}@uni.test` } });

export function resetAuth({ session = null } = {}) {
  Object.values(mockAuth).forEach((fn) => fn.mockReset());
  mockAuth.getSession.mockImplementation(async () => ({ data: { session } }));
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
  mockAuth.signOut.mockResolvedValue({ error: null });
  mockAuth.signInWithPassword.mockResolvedValue({ error: null });
  mockAuth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
  mockAuth.updateUser.mockResolvedValue({ error: null });
}
