import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crearVerificador } from '@plataforma/auth';
import Fastify, { type FastifyInstance } from 'fastify';
import { createLocalJWKSet } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../src/app.js';
import { crearEmisorJwt, type EmisorJwt } from '../src/auth/emisor.js';
import type { ProveedorIdentidad } from '../src/auth/proveedor.js';
import { parsearRoles, SIN_ROLES, type ProveedorRoles } from '../src/auth/roles.js';
import { AlmacenSesionesMemoria } from '../src/auth/sesiones.js';
import { cargarConfig } from '../src/config.js';
import { parsearModulos } from '../src/gateway/modulos.js';

interface Recibido {
  url: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

let upstream: FastifyInstance;
let upstreamUrl: string;
let recibidos: Recibido[] = [];
let emisor: EmisorJwt;
let app: FastifyInstance;

const ISSUER = 'http://localhost:8080';

beforeAll(async () => {
  upstream = Fastify();
  upstream.all('/*', async (req, reply) => {
    recibidos.push({ url: req.url, method: req.method, headers: req.headers, body: req.body ?? null });
    reply.header('set-cookie', 'robo=1; Path=/');
    reply.header('x-modulo', 'ok');
    return { ok: true };
  });
  await upstream.listen({ port: 0, host: '127.0.0.1' });
  upstreamUrl = `http://127.0.0.1:${(upstream.server.address() as AddressInfo).port}`;
  emisor = await crearEmisorJwt({ issuer: ISSUER });
});

afterAll(async () => {
  await upstream.close();
});

afterEach(async () => {
  recibidos = [];
  await app.close();
});

const mapaRoles = parsearRoles(`
version: 1
usuarios:
  - email: ana@ejemplo.test
    empresas: [acopio]
    modulos:
      modulo-ejemplo: [operador]
`);
const roles: ProveedorRoles = { obtenerRoles: async (u) => mapaRoles.get(u.email ?? '') ?? SIN_ROLES };

function crear(email = 'ana@ejemplo.test', modulos = `modulo-ejemplo=${upstreamUrl},caido=http://127.0.0.1:1`) {
  const proveedor: ProveedorIdentidad = {
    urlLogin: async () => new URL('https://idp.test/auth'),
    completarLogin: async () => ({ sub: 'google-123', email, emailVerificado: true, nombre: 'Ana', dominio: null }),
  };
  const config = cargarConfig({
    NODE_ENV: 'test',
    OIDC_CLIENT_ID: 'c',
    OIDC_CLIENT_SECRET: 's',
    SESSION_SECRET: 'x'.repeat(40),
    GATEWAY_TIMEOUT_MS: '2000',
  });
  app = construirApp({
    config,
    emisor,
    roles,
    modulos: parsearModulos(modulos),
    auth: { proveedor, sesiones: new AlmacenSesionesMemoria({ ttlMs: 60_000 }) },
  });
}

/** GET por HTTP sin normalizar la ruta (como la enviaría un cliente malicioso). */
async function getCrudo(ruta: string, cookie: string): Promise<number> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, path: ruta, headers: { cookie: `plat_sesion=${cookie}` } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    r.on('error', reject);
    r.end();
  });
}

async function sesion(): Promise<string> {
  const login = await app.inject({ method: 'GET', url: '/auth/login' });
  const tx = login.cookies.find((c) => c.name === 'plat_login')?.value ?? '';
  const cb = await app.inject({ method: 'GET', url: '/auth/callback?code=a&state=b', cookies: { plat_login: tx } });
  return cb.cookies.find((c) => c.name === 'plat_sesion')?.value ?? '';
}

describe('gateway /m/<id>', () => {
  it('reenvía con un JWT válido del módulo, sin la cookie y con correlationId', async () => {
    crear();
    const cookie = await sesion();
    const res = await app.inject({
      method: 'GET',
      url: '/m/modulo-ejemplo/api/v1/yo?x=1',
      cookies: { plat_sesion: cookie },
      headers: { authorization: 'Bearer token.del.cliente', 'x-correlation-id': 'corr-12345678' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.headers['x-modulo']).toBe('ok');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['x-correlation-id']).toBe('corr-12345678');

    const [r] = recibidos;
    expect(r?.url).toBe('/m/modulo-ejemplo/api/v1/yo?x=1');
    expect(r?.headers.cookie).toBeUndefined();
    expect(r?.headers['x-correlation-id']).toBe('corr-12345678');
    expect(r?.headers['x-forwarded-prefix']).toBe('/m/modulo-ejemplo');

    const token = String(r?.headers.authorization).replace('Bearer ', '');
    expect(token).not.toBe('token.del.cliente');
    const verificar = crearVerificador({ claves: createLocalJWKSet(emisor.jwks()), issuer: ISSUER, audiencia: 'modulo:modulo-ejemplo' });
    await expect(verificar(token)).resolves.toMatchObject({ sub: 'google-123', roles: ['operador'], empresas: ['acopio'] });
  });

  it('reenvía el cuerpo de un POST', async () => {
    crear();
    const cookie = await sesion();
    const res = await app.inject({
      method: 'POST',
      url: '/m/modulo-ejemplo/api/v1/registros',
      cookies: { plat_sesion: cookie },
      payload: { nombre: 'prueba' },
    });
    expect(res.statusCode).toBe(200);
    expect(recibidos[0]?.method).toBe('POST');
    expect(recibidos[0]?.body).toEqual({ nombre: 'prueba' });
  });

  it('sin sesión: navegador → redirige al login; API → 401', async () => {
    crear();
    const html = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/', headers: { accept: 'text/html' } });
    expect(html.statusCode).toBe(302);
    expect(html.headers.location).toBe('/auth/login?returnTo=%2Fm%2Fmodulo-ejemplo%2F');
    const api = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/api/v1/yo' });
    expect(api.statusCode).toBe(401);
    expect(recibidos).toHaveLength(0);
  });

  it('sin roles en el módulo → 403 y la request no llega al módulo', async () => {
    crear('beto@ejemplo.test');
    const cookie = await sesion();
    const res = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/', cookies: { plat_sesion: cookie } });
    expect(res.statusCode).toBe(403);
    expect(recibidos).toHaveLength(0);
  });

  it('módulo inexistente → 404', async () => {
    crear();
    const cookie = await sesion();
    const res = await app.inject({ method: 'GET', url: '/m/no-existe/', cookies: { plat_sesion: cookie } });
    expect(res.statusCode).toBe(404);
  });

  it.each(['/m/modulo-ejemplo/%2e%2e/otro', '/m/modulo-ejemplo/a%2Fb', '/m/modulo-ejemplo/..'])(
    'rechaza rutas que salen del prefijo: %s',
    async (url) => {
      crear();
      const cookie = await sesion();
      // inject normaliza algunas rutas (→ 404); por HTTP crudo llegan tal cual (→ 400). Nunca al módulo.
      const res = await app.inject({ method: 'GET', url, cookies: { plat_sesion: cookie } });
      expect([400, 404]).toContain(res.statusCode);
      expect(await getCrudo(url, cookie)).toBe(400);
      expect(recibidos).toHaveLength(0);
    },
  );

  it('módulo caído → 502', async () => {
    crear('ana@ejemplo.test', `caido=http://127.0.0.1:1`);
    // ana no tiene roles en "caido": se los damos con un mapa propio
    await app.close();
    const r2: ProveedorRoles = { obtenerRoles: async () => ({ plataforma: [], modulos: { caido: ['lector'] }, empresas: [] }) };
    const proveedor: ProveedorIdentidad = {
      urlLogin: async () => new URL('https://idp.test/auth'),
      completarLogin: async () => ({ sub: 's', email: 'ana@ejemplo.test', emailVerificado: true, nombre: null, dominio: null }),
    };
    app = construirApp({
      config: cargarConfig({ NODE_ENV: 'test', OIDC_CLIENT_ID: 'c', OIDC_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(40) }),
      emisor,
      roles: r2,
      modulos: parsearModulos('caido=http://127.0.0.1:1'),
      auth: { proveedor, sesiones: new AlmacenSesionesMemoria({ ttlMs: 60_000 }) },
    });
    const cookie = await sesion();
    const res = await app.inject({ method: 'GET', url: '/m/caido/', cookies: { plat_sesion: cookie } });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ title: 'El módulo no está disponible' });
  });

  it('sin módulos configurados, /m/* no existe', async () => {
    crear('ana@ejemplo.test', '');
    const cookie = await sesion();
    const res = await app.inject({ method: 'GET', url: '/m/modulo-ejemplo/', cookies: { plat_sesion: cookie } });
    expect(res.statusCode).toBe(404);
  });
});
