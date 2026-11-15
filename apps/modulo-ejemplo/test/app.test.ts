import { crearVerificador, type ClaimsPlataforma } from '@plataforma/auth';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirModulo } from '../src/app.js';

const ISSUER = 'http://localhost:8080';
let privada: CryptoKey;
let publica: JWK;
let app: FastifyInstance;

beforeAll(async () => {
  const par = await generateKeyPair('ES256');
  privada = par.privateKey;
  publica = { ...(await exportJWK(par.publicKey)), kid: 'k', alg: 'ES256' };
});

afterEach(async () => {
  await app.close();
});

function crear() {
  const verificar = crearVerificador({ claves: createLocalJWKSet({ keys: [publica] }), issuer: ISSUER, audiencia: 'modulo:modulo-ejemplo' });
  app = construirModulo({ id: 'modulo-ejemplo', verificar });
}

async function token(roles: string[], extra: Partial<ClaimsPlataforma> = {}, aud = 'modulo:modulo-ejemplo') {
  return new SignJWT({ email: 'ana@ejemplo.test', nombre: '<b>Ana</b>', roles, empresas: ['acopio'], ...extra })
    .setProtectedHeader({ alg: 'ES256', kid: 'k' })
    .setIssuer(ISSUER)
    .setSubject('google-123')
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti('j'.repeat(22))
    .sign(privada);
}

const auth = async (roles: string[]) => ({ authorization: `Bearer ${await token(roles)}` });

describe('módulo de ejemplo', () => {
  it('endpoints de sistema sin token', async () => {
    crear();
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/meta' })).json()).toMatchObject({ id: 'modulo-ejemplo' });
  });

  it('sin token o con token de otro módulo → 401', async () => {
    crear();
    expect((await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/api/v1/yo' })).statusCode).toBe(401);
    const otro = await token(['operador'], {}, 'modulo:otro');
    const res = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/api/v1/yo', headers: { authorization: `Bearer ${otro}` } });
    expect(res.statusCode).toBe(401);
  });

  it('con token válido devuelve los claims', async () => {
    crear();
    const res = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/api/v1/yo', headers: await auth(['lector']) });
    expect(res.json()).toMatchObject({ sub: 'google-123', roles: ['lector'] });
  });

  it('autorización por rol (E3)', async () => {
    crear();
    const url = '/m/modulo-ejemplo/api/v1/registros';
    expect((await app.inject({ method: 'POST', url, headers: await auth(['lector']), payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url, headers: await auth(['operador']), payload: { a: 1 } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'DELETE', url: `${url}/1`, headers: await auth(['operador']) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `${url}/1`, headers: await auth(['administrador']) })).statusCode).toBe(204);
  });

  it('la página escapa los datos del usuario y usa el correlationId recibido', async () => {
    crear();
    const res = await app.inject({
      method: 'GET',
      url: '/m/modulo-ejemplo/',
      headers: { ...(await auth(['operador'])), 'x-correlation-id': 'corr-abc' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('&#60;b&#62;Ana&#60;/b&#62;');
    expect(res.body).not.toContain('<b>Ana</b>');
    expect(res.body).toContain('corr-abc');
    const sinBarra = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo', headers: await auth(['lector']) });
    expect(sinBarra.statusCode).toBe(301);
  });

  it('página con datos mínimos (sin nombre, roles ni empresas)', async () => {
    crear();
    const t = await token([], { nombre: null, empresas: [] });
    const res = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/', headers: { authorization: `Bearer ${t}` } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('google-123');
    expect(res.body).toContain('—');
  });

  it('un error inesperado del verificador también responde 401', async () => {
    app = construirModulo({
      id: 'modulo-ejemplo',
      verificar: async () => {
        throw new Error('JWKS caído');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/api/v1/yo', headers: await auth(['lector']) });
    expect(res.statusCode).toBe(401);
  });
});
