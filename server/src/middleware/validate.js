import { AppError } from '../utils/AppError.js';

/** Validates req[source] with a zod schema and stores the parsed value on req.valid[source]. */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({
        field: i.path.join('.') || null,
        message: i.message,
      }));
      return next(AppError.badRequest('Some fields are invalid.', { fields }));
    }
    req.valid = { ...(req.valid || {}), [source]: result.data };
    return next();
  };
}
