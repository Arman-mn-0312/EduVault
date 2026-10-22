import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError, setTokenProvider } from '../src/services/api.js';

function mockFetch(response) {
  const fn = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fn);
  return fn;
}
const jsonRes = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

describe('apiFetch', () => {
  beforeEach(() => setTokenProvider(async () => null));
  afterEach(() => vi.unstubAllGlobals());

  it('returns parsed JSON on success', async () => {
    mockFetch(jsonRes(200, { status: 'ok' }));
    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('turns the server error envelope into an ApiError', async () => {
    mockFetch(jsonRes(403, { error: { code: 'FORBIDDEN', message: 'Admins only' } }));
    const err = await apiFetch('/admin/stats').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'Admins only' });
  });

  it('wraps network failures with a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const err = await apiFetch('/health').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('attaches the bearer token from the provider, and skips it when auth=false', async () => {
    setTokenProvider(async () => 'jwt-123');
    const f = mockFetch(jsonRes(200, {}));
    await apiFetch('/profile');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-123');
    await apiFetch('/health', { auth: false });
    expect(f.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  it('sends JSON bodies with a content type, but leaves FormData untouched', async () => {
    const f = mockFetch(jsonRes(200, {}));
    await apiFetch('/x', { method: 'POST', body: { a: 1 } });
    expect(f.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
    expect(f.mock.calls[0][1].body).toBe('{"a":1}');
    const fd = new FormData();
    await apiFetch('/upload', { method: 'POST', body: fd });
    expect(f.mock.calls[1][1].headers['Content-Type']).toBeUndefined();
    expect(f.mock.calls[1][1].body).toBe(fd);
  });
});
