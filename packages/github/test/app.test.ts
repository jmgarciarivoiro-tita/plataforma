import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { crearProveedorTokenApp, jwtDeApp } from '../src/index.js';

// Clave PKCS#1 como la que descarga GitHub ("BEGIN RSA PRIVATE KEY").
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

describe('autenticación como GitHub App', () => {
  it('firma un JWT RS256 verificable, con iss = client ID y vida de 10 minutos', () => {
    const jwt = jwtDeApp('Iv23abc', privateKey, 1_000_000);
    const [h, c, f] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h ?? '', 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(c ?? '', 'base64url').toString())).toEqual({ iat: 999_940, exp: 1_000_540, iss: 'Iv23abc' });
    const ok = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(createPublicKey(privateKey), Buffer.from(f ?? '', 'base64url'));
    expect(ok).toBe(true);
  });

  it('obtiene el token de instalación con los permisos pedidos y lo reutiliza hasta 5 min antes de vencer', async () => {
    const llamadas: { url: string; body?: string }[] = [];
    let ahora = Date.parse('2026-11-17T10:00:00Z');
    const fetchFn = (async (url: string, init: RequestInit) => {
      llamadas.push({ url, ...(init.body ? { body: String(init.body) } : {}) });
      if (url.endsWith('/installation')) return new Response('{"id":42}', { status: 200 });
      return new Response(JSON.stringify({ token: `tok-${llamadas.length}`, expires_at: new Date(ahora + 3_600_000).toISOString() }), { status: 201 });
    }) as unknown as typeof fetch;
    const token = crearProveedorTokenApp({ clientId: 'Iv23abc', clavePrivada: pem, org: 'mi-org', permisos: { deployments: 'write' }, fetchFn, ahora: () => ahora });

    expect(await token()).toBe('tok-2');
    expect(llamadas.map((l) => l.url)).toEqual(['https://api.github.com/orgs/mi-org/installation', 'https://api.github.com/app/installations/42/access_tokens']);
    expect(JSON.parse(llamadas[1]?.body ?? '{}')).toEqual({ permissions: { deployments: 'write' } });
    ahora += 50 * 60_000;
    expect(await token()).toBe('tok-2');
    ahora += 6 * 60_000;
    expect(await token()).toBe('tok-4');
  });

  it('un error de GitHub se informa sin datos sensibles', async () => {
    const fetchFn = (async () => new Response('{"message":"Bad credentials"}', { status: 401 })) as unknown as typeof fetch;
    const token = crearProveedorTokenApp({ clientId: 'x', clavePrivada: pem, org: 'o', fetchFn });
    await expect(token()).rejects.toThrow('GitHub App: GET /orgs/o/installation → 401');
  });
});
