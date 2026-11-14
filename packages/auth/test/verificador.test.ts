import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AUDIENCIA_PLATAFORMA,
  audienciaModulo,
  crearVerificador,
  tieneRol,
  tokenDeHeader,
  TokenInvalidoError,
} from '../src/index.js';

const ISSUER = 'http://localhost:8080';
let privada: CryptoKey;
let otraPrivada: CryptoKey;
let jwkPublica: JWK;
let jwks: FastifyInstance;
let jwksUrl: string;

const base = { email: 'ana@ejemplo.test', nombre: 'Ana', roles: ['lector'], empresas: ['corretaje'] };

async function firmar(
  o: { aud?: string; iss?: string; exp?: string | number; clave?: CryptoKey; alg?: string; claims?: object } = {},
) {
  return new SignJWT({ ...base, ...o.claims })
    .setProtectedHeader({ alg: o.alg ?? 'ES256', kid: 'k1' })
    .setIssuer(o.iss ?? ISSUER)
    .setSubject('google-123')
    .setAudience(o.aud ?? 'modulo:ejemplo')
    .setIssuedAt()
    .setExpirationTime(o.exp ?? '5m')
    .setJti('j'.repeat(22))
    .sign(o.clave ?? privada);
}

beforeAll(async () => {
  const par = await generateKeyPair('ES256');
  privada = par.privateKey;
  otraPrivada = (await generateKeyPair('ES256')).privateKey;
  jwkPublica = { ...(await exportJWK(par.publicKey)), kid: 'k1', alg: 'ES256' };
  jwks = Fastify();
  jwks.get('/.well-known/jwks.json', async () => ({ keys: [jwkPublica] }));
  await jwks.listen({ port: 0, host: '127.0.0.1' });
  jwksUrl = `http://127.0.0.1:${(jwks.server.address() as AddressInfo).port}/.well-known/jwks.json`;
});

afterAll(async () => {
  await jwks.close();
});

describe('crearVerificador', () => {
  it('acepta un token válido obtenido del JWKS remoto', async () => {
    const verificar = crearVerificador({ jwksUrl, issuer: ISSUER, audiencia: audienciaModulo('ejemplo') });
    const claims = await verificar(await firmar());
    expect(claims).toMatchObject({ sub: 'google-123', aud: 'modulo:ejemplo', roles: ['lector'] });
    expect(tieneRol(claims, 'lector')).toBe(true);
    expect(tieneRol(claims, 'administrador')).toBe(false);
  });

  const local = () => crearVerificador({ claves: createLocalJWKSet({ keys: [jwkPublica] }), issuer: ISSUER, audiencia: 'modulo:ejemplo' });

  it.each([
    ['audiencia de otro módulo', { aud: 'modulo:otro' }],
    ['audiencia de la plataforma', { aud: AUDIENCIA_PLATAFORMA }],
    ['emisor distinto', { iss: 'https://otro.test' }],
    ['firmado con otra clave', { clave: undefined as unknown as CryptoKey }],
    ['vencido', { exp: Math.floor(Date.now() / 1000) - 120 }],
    ['claims incompletos', { claims: { roles: 'no-es-lista' } }],
  ])('rechaza: %s', async (_caso, o) => {
    const opciones = 'clave' in o ? { clave: otraPrivada } : o;
    await expect(local()(await firmar(opciones))).rejects.toBeInstanceOf(TokenInvalidoError);
  });

  it('rechaza un algoritmo distinto de ES256 (HS256 con secreto)', async () => {
    const hs = await new SignJWT(base)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setSubject('x')
      .setAudience('modulo:ejemplo')
      .setIssuedAt()
      .setExpirationTime('5m')
      .setJti('j'.repeat(22))
      .sign(new TextEncoder().encode('s'.repeat(32)));
    await expect(local()(hs)).rejects.toBeInstanceOf(TokenInvalidoError);
  });

  it('rechaza basura', async () => {
    await expect(local()('no.es.jwt')).rejects.toBeInstanceOf(TokenInvalidoError);
  });

  it('exige jwksUrl o claves', () => {
    expect(() => crearVerificador({ issuer: ISSUER, audiencia: 'plataforma' })).toThrow();
  });
});

describe('utilidades', () => {
  it('tokenDeHeader', () => {
    expect(tokenDeHeader('Bearer aaa.bbb.ccc')).toBe('aaa.bbb.ccc');
    expect(tokenDeHeader('bearer aaa.bbb.ccc')).toBeNull();
    expect(tokenDeHeader('Bearer aaa.bbb')).toBeNull();
    expect(tokenDeHeader(undefined)).toBeNull();
  });

  it('audienciaModulo valida el id', () => {
    expect(audienciaModulo('contratos-granos')).toBe('modulo:contratos-granos');
    expect(() => audienciaModulo('../x')).toThrow();
  });
});
