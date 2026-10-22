import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createApiRouter } from './routes/index.js';
import { createRateLimiters } from './middleware/rateLimiters.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createSupabaseService } from './services/supabaseService.js';

/** App factory: no side effects, so tests can build isolated instances. */
export function createApp({ config, supabase = createSupabaseService(config) }) {
  const app = express();
  const limiters = createRateLimiters();

  app.disable('x-powered-by');
  // Behind Render/Vercel proxies, set TRUST_PROXY=1 so rate limits use the real client IP.
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / non-browser clients (no Origin header) and listed origins only.
        if (!origin || config.clientOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    })
  );
  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use('/api', limiters.general);

  // Limiters are exposed so feature routers (added in later phases) can attach them.
  app.locals.limiters = limiters;
  app.locals.config = config;

  app.use('/api', createApiRouter({ config, limiters, supabase }));

  app.use(notFoundHandler);
  app.use(createErrorHandler(config));
  return app;
}
