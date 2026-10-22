import rateLimit from 'express-rate-limit';

function limiter({ windowMs, limit, code, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code, message } });
    },
  });
}

/**
 * Limiter factories. Each call returns fresh instances (separate counters),
 * which keeps tests isolated. Values are conservative defaults; tune per deployment.
 * NOTE: the default in-memory store is per-process. With multiple instances,
 * switch to a shared store (e.g. Redis) before relying on these limits.
 */
export function createRateLimiters() {
  const minute = 60 * 1000;
  return {
    general: limiter({
      windowMs: minute, limit: 300,
      code: 'RATE_LIMITED', message: 'Too many requests. Slow down and try again shortly.',
    }),
    // Counts only FAILED requests (401/403/...). Throttles token guessing on authenticated routes.
    // Sign-in/registration/reset happen directly against Supabase Auth, so their rate limits
    // are configured in the Supabase dashboard (Auth > Rate Limits), not here.
    auth: limiter({
      windowMs: 15 * minute, limit: 20, skipSuccessfulRequests: true,
      code: 'AUTH_RATE_LIMITED', message: 'Too many sign-in attempts. Try again in a few minutes.',
    }),
    upload: limiter({
      windowMs: 60 * minute, limit: 20,
      code: 'UPLOAD_RATE_LIMITED', message: 'Upload limit reached. Try again later.',
    }),
    download: limiter({
      windowMs: 10 * minute, limit: 60,
      code: 'DOWNLOAD_RATE_LIMITED', message: 'Too many download requests. Try again shortly.',
    }),
    report: limiter({
      windowMs: 60 * minute, limit: 15,
      code: 'REPORT_RATE_LIMITED', message: 'Too many reports submitted. Try again later.',
    }),
    search: limiter({
      windowMs: minute, limit: 120,
      code: 'SEARCH_RATE_LIMITED', message: 'Too many searches. Try again in a moment.',
    }),
  };
}
