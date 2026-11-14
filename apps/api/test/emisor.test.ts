import { crearVerificador } from '@plataforma/auth';
import { createLocalJWKSet, decodeProtectedHeader, exportJWK, generateKeyPair } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { crearEmisorJwt } from '../src/auth/emisor.js';
import { AlmacenSesionesMemoria } from '../src/auth/sesiones.js';
import type { ProveedorIdentidad } from '../src/auth/proveedor.js';
import { cargarConfig } from '../src/config.js';

const ISSUER = 'http://localhost:8080';
const usuario = { sub: 'google-123', email: 'ana@ejemplo.test', nombre: 'Ana', dominio: null };

async function jwkPrivadaTexto() {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const { kty, crv, x, y, d } = await exportJWK(privateKey);
  return JSON.stringify({ kty, crv, x, y, d });
}

describe('crearEmisorJwt', () => {
  it('emite un token que el verificador de @plataforma/auth acepta', async () => {
    const emisor = await crearEmisorJwt({ issuer: ISSUER, jwkPrivada: await jwkPrivadaTexto() });
    expect(emisor.efimera).toBe(false);
    const token = await emisor.emitir({ usuario, audiencia: 'modulo:ejemplo', roles: ['operador'], empresas: ['acopio'] });
    const verificar = crearVerificador({ claves: createLocalJWKSet(emisor.jwks()), issuer: ISSUER, audiencia: 'modulo:ejemplo' });
    const claims = await verificar(token);
    expect(claims).toMatchObject({ sub: 'google-123', roles: ['operador'], empresas: ['acopio'], email: 'ana@ejemplo.test' });
    expect(claims.exp - claims.iat).toBe(300);
    expect(decodeProtectedHeader(token).kid).toBe(emisor.jwks().keys[0]?.kid);
  });

  it('el JWKS publica solo la parte pública', async () => {
    const emisor = await crearEmisorJwt({ issuer: ISSUER, jwkPrivada: await jwkPrivadaTexto() });
    const [clave] = emisor.jwks().keys;
    expect(clave).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig' });
    expect(clave).not.toHaveProperty('d');
  });

  it('genera una clave efímera si no se configura', async () => {
    const emisor = await crearEmisorJwt({ issuer: ISSUER });
    expect(emisor.efimera).toBe(true);
    expect(emisor.jwks().keys).toHaveLength(1);
  });

  it('durante una rotación publica también la clave anterior', async () => {
    const anterior = await crearEmisorJwt({ issuer: ISSUER, jwkPrivada: await jwkPrivadaTexto() });
    const [pubAnterior] = anterior.jwks().keys;
    const actual = await crearEmisorJwt({
      issuer: ISSUER,
      jwkPrivada: await jwkPrivadaTexto(),
      jwkPublicaAnterior: JSON.stringify(pubAnterior),
    });
    expect(actual.jwks().keys).toHaveLength(2);
    // Un token emitido con la clave anterior sigue validando durante la rotación.
    const viejo = await anterior.emitir({ usuario, audiencia: 'plataforma', roles: [], empresas: [] });
    const verificar = crearVerificador({ claves: createLocalJWKSet(actual.jwks()), issuer: ISSUER, audiencia: 'plataforma' });
    await expect(verificar(viejo)).resolves.toMatchObject({ sub: 'google-123' });
  });

  it('rechaza una clave privada con formato inválido', async () => {
    await expect(crearEmisorJwt({ issuer: ISSUER, jwkPrivada: '{"kty":"RSA"}' })).rejects.toThrow();
  });
});

describe('rutas JWT', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  const proveedor: ProveedorIdentidad = {
    urlLogin: async () => new URL('https://idp.test/auth'),
    completarLogin: async () => ({ sub: 'google-123', email: 'ana@ejemplo.test', emailVerificado: true, nombre: 'Ana', dominio: null }),
  };

  async function crear(entorno: 'local' | 'staging') {
    const emisor = await crearEmisorJwt({ issuer: ISSUER, jwkPrivada: await jwkPrivadaTexto() });
    const config = cargarConfig({
      NODE_ENV: 'test',
      ENTORNO: entorno,
      OIDC_CLIENT_ID: 'c',
      OIDC_CLIENT_SECRET: 's',
      SESSION_SECRET: 'x'.repeat(40),
      PLATFORM_JWT_PRIVATE_JWK: 'presente',
    });
    app = construirApp({ config, emisor, auth: { proveedor, sesiones: new AlmacenSesionesMemoria({ ttlMs: 60_000 }) } });
    return emisor;
  }

  async function sesion(): Promise<string> {
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const tx = login.cookies.find((c) => c.name === 'plat_login')?.value ?? '';
    const cb = await app.inject({ method: 'GET', url: '/auth/callback?code=a&state=b', cookies: { plat_login: tx } });
    return cb.cookies.find((c) => c.name === 'plat_sesion')?.value ?? '';
  }

  it('GET /.well-known/jwks.json es público y cacheable', async () => {
    const emisor = await crear('local');
    const res = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.json()).toEqual(emisor.jwks());
  });

  it('el diagnóstico local devuelve un token verificable para el usuario logueado', async () => {
    const emisor = await crear('local');
    const cookie = await sesion();
    const res = await app.inject({ method: 'GET', url: '/auth/token-diagnostico?aud=modulo:ejemplo', cookies: { plat_sesion: cookie } });
    expect(res.statusCode).toBe(200);
    const { token, claims } = res.json() as { token: string; claims: { aud: string } };
    expect(claims.aud).toBe('modulo:ejemplo');
    const verificar = crearVerificador({ claves: createLocalJWKSet(emisor.jwks()), issuer: ISSUER, audiencia: 'modulo:ejemplo' });
    await expect(verificar(token)).resolves.toMatchObject({ sub: 'google-123' });
  });

  it('el diagnóstico exige sesión y una audiencia válida', async () => {
    await crear('local');
    expect((await app.inject({ method: 'GET', url: '/auth/token-diagnostico' })).statusCode).toBe(401);
    const cookie = await sesion();
    const malo = await app.inject({ method: 'GET', url: '/auth/token-diagnostico?aud=otro', cookies: { plat_sesion: cookie } });
    expect(malo.statusCode).toBe(400);
    const plat = await app.inject({ method: 'GET', url: '/auth/token-diagnostico', cookies: { plat_sesion: cookie } });
    expect((plat.json() as { claims: { aud: string } }).claims.aud).toBe('plataforma');
  });

  it('el diagnóstico no existe fuera de ENTORNO=local', async () => {
    await crear('staging');
    const cookie = await sesion();
    const res = await app.inject({ method: 'GET', url: '/auth/token-diagnostico', cookies: { plat_sesion: cookie } });
    expect(res.statusCode).toBe(404);
  });
});
