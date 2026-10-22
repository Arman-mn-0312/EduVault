import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, _res, next) {
  next(AppError.notFound(`Route not found: ${req.method} ${req.path}`));
}

/** Consistent error envelope: { error: { code, message, details? } } */
export function createErrorHandler(config) {
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, _req, res, _next) {
    if (res.headersSent) return;

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong on our side. Try again later.';
    let details;

    if (err instanceof AppError) {
      ({ status, code, message, details } = err);
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Request body is not valid JSON.';
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body is too large.';
    }

    if (status >= 500 && !config.isTest) {
      // Log full detail server-side only; never return stack traces to clients.
      console.error(`[error] ${err?.stack || err}`);
    }

    res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
  };
}
