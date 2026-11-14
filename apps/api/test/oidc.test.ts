// Prueba de integración del adaptador OIDC contra un IdP falso local (discovery, PKCE, ID token).
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearProveedorOidc } from '../src/auth/oidc.js';

const CLIENT_ID = 'cliente-test';
const CLIENT_SECRET = 'secreto-test';
const REDIRECT = 'http://localhost:8080/auth/callback';

let idp: FastifyInstance;
let issuer: string;
let clavePrivada: CryptoKey;
let nonceDelToken: string | null = null; // si se define, el IdP firma ese nonce (para probar el rechazo)
const pedidos = new Map<string, { challenge: string; nonce: string }>();

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  clavePrivada = privateKey;
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

  idp = Fastify();
  idp.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) =>
    done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
  idp.get('/.well-known/openid-configuration', async () => ({
    issuer,
    authorization_endpoint: `${issuer}/auth`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    code_challenge_methods_supported: ['S256'],
  }));
  idp.get('/jwks', async () => ({ keys: [jwk] }));
  idp.post('/token', async (req, reply) => {
    const b = req.body as Record<string, string>;
    const pedido = pedidos.get(b.code ?? '');
    const challenge = createHash('sha256').update(b.code_verifier ?? '').digest('base64url');
    if (b.client_id !== CLIENT_ID || b.client_secret !== CLIENT_SECRET || !pedido || pedido.challenge !== challenge) {
      return reply.code(400).send({ error: 'invalid_grant' });
    }
    const idToken = await new SignJWT({
      nonce: nonceDelToken ?? pedido.nonce,
      email: 'ana@ejemplo.test',
      email_verified: true,
      name: 'Ana Prueba',
      hd: 'empresa.test',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience(CLIENT_ID)
      .setSubject('google-123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(clavePrivada);
    return { access_token: 'at', token_type: 'Bearer', expires_in: 300, id_token: idToken };
  });
  await idp.listen({ port: 0, host: '127.0.0.1' });
  issuer = `http://127.0.0.1:${(idp.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await idp.close();
});

function proveedor() {
  return crearProveedorOidc({
    issuer,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT,
    dominioSugerido: 'empresa.test',
    permitirHttpSoloTests: true,
  });
}

const verifier = 'v'.repeat(50);
const challenge = createHash('sha256').update(verifier).digest('base64url');

describe('crearProveedorOidc', () => {
  it('arma la URL de autorización con PKCE S256, state, nonce y hd', async () => {
    const url = await proveedor().urlLogin({ state: 'st', nonce: 'no', codeChallenge: challenge });
    expect(url.origin + url.pathname).toBe(`${issuer}/auth`);
    const p = url.searchParams;
    expect(p.get('client_id')).toBe(CLIENT_ID);
    expect(p.get('redirect_uri')).toBe(REDIRECT);
    expect(p.get('scope')).toBe('openid email profile');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toBe(challenge);
    expect(p.get('state')).toBe('st');
    expect(p.get('nonce')).toBe('no');
    expect(p.get('hd')).toBe('empresa.test');
  });

  it('canjea el código y devuelve la identidad validada', async () => {
    nonceDelToken = null;
    pedidos.set('codigo-1', { challenge, nonce: 'n1' });
    const identidad = await proveedor().completarLogin(new URL(`${REDIRECT}?code=codigo-1&state=s1`), {
      state: 's1',
      nonce: 'n1',
      codeVerifier: verifier,
    });
    expect(identidad).toEqual({
      sub: 'google-123',
      email: 'ana@ejemplo.test',
      emailVerificado: true,
      nombre: 'Ana Prueba',
      dominio: 'empresa.test',
    });
  });

  it('rechaza un state distinto', async () => {
    pedidos.set('codigo-2', { challenge, nonce: 'n2' });
    await expect(
      proveedor().completarLogin(new URL(`${REDIRECT}?code=codigo-2&state=otro`), {
        state: 's2',
        nonce: 'n2',
        codeVerifier: verifier,
      }),
    ).rejects.toThrow();
  });

  it('rechaza un ID token con nonce distinto', async () => {
    nonceDelToken = 'nonce-ajeno';
    pedidos.set('codigo-3', { challenge, nonce: 'n3' });
    await expect(
      proveedor().completarLogin(new URL(`${REDIRECT}?code=codigo-3&state=s3`), {
        state: 's3',
        nonce: 'n3',
        codeVerifier: verifier,
      }),
    ).rejects.toThrow();
    nonceDelToken = null;
  });

  it('rechaza un code_verifier incorrecto (PKCE)', async () => {
    pedidos.set('codigo-4', { challenge, nonce: 'n4' });
    await expect(
      proveedor().completarLogin(new URL(`${REDIRECT}?code=codigo-4&state=s4`), {
        state: 's4',
        nonce: 'n4',
        codeVerifier: 'w'.repeat(50),
      }),
    ).rejects.toThrow();
  });

  it('si el discovery falla, reintenta en el siguiente uso', async () => {
    const p = crearProveedorOidc({
      issuer: 'http://127.0.0.1:1',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT,
      permitirHttpSoloTests: true,
    });
    await expect(p.urlLogin({ state: 's', nonce: 'n', codeChallenge: challenge })).rejects.toThrow();
    await expect(p.urlLogin({ state: 's', nonce: 'n', codeChallenge: challenge })).rejects.toThrow();
  });
});
