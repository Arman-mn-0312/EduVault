import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { buildTestApp } from './helpers.js';
import { createRateLimiters } from '../src/middleware/rateLimiters.js';

describe('CORS', () => {
  it('echoes allowed origins only', async () => {
    const { app } = buildTestApp({ CLIENT_ORIGIN: 'https://hub.example.edu' });
    const ok = await request(app).get('/api/health').set('Origin', 'https://hub.example.edu');
    expect(ok.headers['access-control-allow-origin']).toBe('https://hub.example.edu');
    const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiters', () => {
  it('exposes the limiters the later phases rely on', () => {
    const l = createRateLimiters();
    for (const k of ['general', 'auth', 'upload', 'download', 'report', 'search']) {
      expect(typeof l[k]).toBe('function');
    }
  });

  it('auth limiter returns a 429 envelope after 20 failed requests', async () => {
    const { auth } = createRateLimiters();
    const app = express();
    app.post('/login', auth, (_req, res) => res.status(401).json({ error: 'no' }));
    let last;
    for (let i = 0; i < 21; i++) last = await request(app).post('/login');
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('AUTH_RATE_LIMITED');
  });
});
