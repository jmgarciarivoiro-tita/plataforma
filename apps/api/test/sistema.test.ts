import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { cargarConfig } from '../src/config.js';

const config = cargarConfig({ NODE_ENV: 'test', APP_VERSION: '1.2.3', APP_COMMIT: 'abc123', APP_DIGEST: 'sha256:x' });
let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

describe('endpoints de sistema (E4)', () => {
  it('GET /health responde ok', async () => {
    app = construirApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ estado: 'ok' });
  });

  it('GET /ready responde 200 cuando todos los chequeos pasan', async () => {
    app = construirApp({ config, chequeos: [{ nombre: 'db', verificar: async () => true }] });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ estado: 'listo' });
  });

  it('GET /ready responde 503 si un chequeo falla o lanza error', async () => {
    app = construirApp({
      config,
      chequeos: [
        { nombre: 'db', verificar: async () => false },
        { nombre: 'otro', verificar: async () => { throw new Error('caído'); } },
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      estado: 'no_listo',
      chequeos: [
        { nombre: 'db', ok: false },
        { nombre: 'otro', ok: false },
      ],
    });
  });

  it('GET /meta expone versión, commit y digest', async () => {
    app = construirApp({ config });
    const res = await app.inject({ method: 'GET', url: '/meta' });
    expect(res.json()).toMatchObject({ id: 'plataforma-api', version: '1.2.3', commit: 'abc123', digest: 'sha256:x' });
  });
});

describe('correlationId (E7)', () => {
  it('reutiliza un x-correlation-id válido', async () => {
    app = construirApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-correlation-id': 'corr-12345678' } });
    expect(res.headers['x-correlation-id']).toBe('corr-12345678');
  });

  it('genera uno nuevo si el recibido es inválido', async () => {
    app = construirApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-correlation-id': 'mal<script>' } });
    expect(res.headers['x-correlation-id']).not.toBe('mal<script>');
    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('errores (E8)', () => {
  it('404 en formato Problem Details', async () => {
    app = construirApp({ config });
    const res = await app.inject({ method: 'GET', url: '/no-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 404, title: 'No encontrado' });
  });

  it('500 sin detalles internos', async () => {
    app = construirApp({ config });
    app.get('/explota', async () => {
      throw new Error('detalle interno secreto');
    });
    const res = await app.inject({ method: 'GET', url: '/explota' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('detalle interno secreto');
    expect(res.json()).toMatchObject({ status: 500, title: 'Error interno' });
  });

  it('4xx conserva el mensaje del error', async () => {
    app = construirApp({ config });
    app.get('/malo', async () => {
      const e = new Error('Parámetro inválido') as Error & { statusCode: number };
      e.statusCode = 400;
      throw e;
    });
    const res = await app.inject({ method: 'GET', url: '/malo' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ status: 400, title: 'Parámetro inválido' });
  });
});

describe('configuración (P1)', () => {
  it('rechaza un puerto inválido', () => {
    expect(() => cargarConfig({ PORT: 'abc' })).toThrow(/Configuración inválida/);
  });

  it('aplica valores por defecto', () => {
    expect(cargarConfig({})).toMatchObject({ PORT: 3000, ENTORNO: 'local' });
  });
});

describe('configuración de identidad', () => {
  it('exige secreto de cliente y de sesión si hay OIDC_CLIENT_ID', () => {
    expect(() => cargarConfig({ OIDC_CLIENT_ID: 'x' })).toThrow(/OIDC_CLIENT_SECRET y SESSION_SECRET/);
  });

  it('rechaza un SESSION_SECRET corto', () => {
    expect(() => cargarConfig({ SESSION_SECRET: 'corto' })).toThrow(/32 caracteres/);
  });

  it('trata las variables vacías del .env como no definidas', () => {
    expect(cargarConfig({ OIDC_CLIENT_ID: '', OIDC_DOMINIO_REQUERIDO: '' })).toMatchObject({
      OIDC_CLIENT_ID: undefined,
      OIDC_DOMINIO_REQUERIDO: undefined,
    });
  });
});
