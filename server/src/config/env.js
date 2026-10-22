import { z } from 'zod';

// default() must come BEFORE transform(): in Zod 4 a default after a transform is returned as-is (untransformed).
const bool = (def) =>
  z.enum(['true', 'false']).default(def).transform((v) => v === 'true');

const optionalString = z.string().min(1).optional().or(z.literal('').transform(() => undefined));
const optionalUrl = z.string().url().optional().or(z.literal('').transform(() => undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  JSON_BODY_LIMIT: z.string().default('100kb'),

  SUPABASE_URL: optionalUrl,
  SUPABASE_PUBLISHABLE_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('documents'),

  MAX_FILE_SIZE_MB: z.coerce.number().positive().max(100).default(25),
  MODERATION_ENABLED: bool('true'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  EXTRACTION_MAX_ENTRIES: z.coerce.number().int().min(1).max(10000).default(1000),
  EXTRACTION_MAX_EXPANDED_MB: z.coerce.number().positive().max(500).default(100),
  EXTRACTION_MAX_COMPRESSION_RATIO: z.coerce.number().positive().max(10000).default(100),
  EXTRACTION_MAX_SECONDS: z.coerce.number().int().min(1).max(120).default(10),
  EXTRACTION_MAX_CHARACTERS: z.coerce.number().int().min(1000).max(200000).default(200000),
});

/**
 * Parse and validate environment variables. Throws a readable error on invalid values.
 * Supabase credentials are optional at boot so the server can start and report
 * `supabase.configured = false`; features that need them fail with 503 until set.
 */
export function loadConfig(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;

  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    clientOrigins: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY,
    jsonBodyLimit: env.JSON_BODY_LIMIT,
    supabase: Object.freeze({
      url: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      secretKey: env.SUPABASE_SECRET_KEY,
      bucket: env.SUPABASE_STORAGE_BUCKET,
      // user-scoped features need url + publishable key; privileged features also need the secret key
      isConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
      hasServiceRole: Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY),
    }),
    upload: Object.freeze({
      maxFileSizeBytes: Math.floor(env.MAX_FILE_SIZE_MB * 1024 * 1024),
      maxFileSizeMb: env.MAX_FILE_SIZE_MB,
      moderationEnabled: env.MODERATION_ENABLED,
    }),
    signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
    extraction: Object.freeze({
      maxEntries: env.EXTRACTION_MAX_ENTRIES,
      maxExpandedBytes: env.EXTRACTION_MAX_EXPANDED_MB * 1024 * 1024,
      maxCompressionRatio: env.EXTRACTION_MAX_COMPRESSION_RATIO,
      maxProcessingMs: env.EXTRACTION_MAX_SECONDS * 1000,
      maxExtractedCharacters: env.EXTRACTION_MAX_CHARACTERS,
    }),
  });
}
