import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { buildTestApp } from './helpers.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';
import { AppError } from '../src/utils/AppError.js';
import { loadConfig } from '../src/config/env.js';

describe('error envelope', () => {
  it('returns a JSON 404 envelope for unknown routes', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 INVALID_JSON for malformed bodies', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('does not leak internals for unexpected errors', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    const app = express();
    app.get('/boom', () => { throw new Error('db password is hunter2'); });
    app.use(createErrorHandler(config));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('passes through operational AppErrors with their status and code', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    const app = express();
    app.get('/nope', () => { throw AppError.forbidden('Admins only'); });
    app.use(createErrorHandler(config));
    const res = await request(app).get('/nope');
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'Admins only' });
  });
});
