import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { construirApp } from '../src/app.js';
import { cargarConfig } from '../src/config.js';
import type { ChequeosCallback, IdentidadExterna, ParametrosLogin, ProveedorIdentidad } from '../src/auth/proveedor.js';
import { AlmacenSesionesMemoria } from '../src/auth/sesiones.js';

const ENV_AUTH = {
  NODE_ENV: 'test',
  PLATFORM_URL_PUBLICA: 'http://localhost:8080',
  OIDC_CLIENT_ID: 'cliente-test',
  OIDC_CLIENT_SECRET: 'secreto-test',
  SESSION_SECRET: 'x'.repeat(40),
};

const identidadOk: IdentidadExterna = {
  sub: 'google-123',
  email: 'ana@ejemplo.test',
  emailVerificado: true,
  nombre: 'Ana Prueba',
  dominio: null,
};

/** IdP falso: registra lo que recibe y devuelve la identidad configurada. */
class ProveedorFalso implements ProveedorIdentidad {
  ultimoLogin: ParametrosLogin | null = null;
  ultimosChequeos: ChequeosCallback | null = null;
  constructor(
    public identidad: IdentidadExterna = identidadOk,
    public falla: 'ninguna' | 'login' | 'callback' = 'ninguna',
  ) {}
  async urlLogin(p: ParametrosLogin): Promise<URL> {
    if (this.falla === 'login') throw new Error('IdP caído');
    this.ultimoLogin = p;
    return new URL(`https://idp.ejemplo.test/auth?state=${p.state}`);
  }
  async completarLogin(_url: URL, c: ChequeosCallback): Promise<IdentidadExterna> {
    this.ultimosChequeos = c;
    if (this.falla === 'callback') throw new Error('state no coincide');
    return this.identidad;
  }
}

let app: FastifyInstance;
afterEach(async () => {
  await app.close();
});

function crear(proveedor = new ProveedorFalso(), env: Record<string, string> = ENV_AUTH) {
  const sesiones = new AlmacenSesionesMemoria({ ttlMs: 60_000 });
  app = construirApp({ config: cargarConfig(env), auth: { proveedor, sesiones } });
  return { proveedor, sesiones };
}

function cookie(res: LightMyRequestResponse, nombre: string): string | undefined {
  return res.cookies.find((c) => c.name === nombre)?.value;
}

async function iniciarLogin(returnTo = '/') {
  const res = await app.inject({ method: 'GET', url: `/auth/login?returnTo=${encodeURIComponent(returnTo)}` });
  return { res, tx: cookie(res, 'plat_login') };
}

async function loginCompleto() {
  const { tx } = await iniciarLogin('/m/ejemplo');
  const res = await app.inject({
    method: 'GET',
    url: '/auth/callback?code=abc&state=x',
    cookies: { plat_login: tx ?? '' },
  });
  return { res, sesion: cookie(res, 'plat_sesion') };
}

describe('GET /auth/login', () => {
  it('redirige al IdP con PKCE y guarda la transacción en una cookie firmada', async () => {
    const { proveedor } = crear();
    const { res, tx } = await iniciarLogin();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/idp\.ejemplo\.test\/auth/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(proveedor.ultimoLogin?.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const c = res.cookies.find((x) => x.name === 'plat_login');
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/auth' });
    expect(tx).toContain('.'); // firmada
  });

  it.each(['//evil.example', 'https://evil.example', '/\\evil', 'relativo'])(
    'rechaza returnTo externo: %s',
    async (returnTo) => {
      crear();
      const { res } = await iniciarLogin(returnTo);
      expect(res.statusCode).toBe(400);
    },
  );

  it('502 si el IdP no responde', async () => {
    crear(new ProveedorFalso(identidadOk, 'login'));
    const { res } = await iniciarLogin();
    expect(res.statusCode).toBe(502);
  });
});

describe('GET /auth/callback', () => {
  it('crea la sesión y redirige a returnTo', async () => {
    const { proveedor, sesiones } = crear();
    const { res, sesion } = await loginCompleto();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/m/ejemplo');
    expect(sesion).toBeDefined();
    expect(sesiones.cantidad).toBe(1);
    // Se pasaron al IdP los mismos state/nonce/verifier generados en el login.
    expect(proveedor.ultimosChequeos?.state).toBeTruthy();
    expect(proveedor.ultimosChequeos?.codeVerifier.length).toBeGreaterThanOrEqual(43);
    const c = res.cookies.find((x) => x.name === 'plat_sesion');
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(c?.secure).toBeFalsy(); // localhost
  });

  it('400 sin cookie de transacción', async () => {
    crear();
    const res = await app.inject({ method: 'GET', url: '/auth/callback?code=abc&state=x' });
    expect(res.statusCode).toBe(400);
  });

  it('400 con cookie de transacción adulterada', async () => {
    crear();
    const falsa = JSON.stringify({ state: 'a', nonce: 'b', verifier: 'c'.repeat(43), returnTo: '/' });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/callback?code=abc&state=a',
      cookies: { plat_login: `${falsa}.firma-invalida` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('401 si el IdP devuelve error', async () => {
    crear();
    const { tx } = await iniciarLogin();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/callback?error=access_denied',
      cookies: { plat_login: tx ?? '' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('401 si la validación del IdP falla (state, nonce o PKCE)', async () => {
    crear(new ProveedorFalso(identidadOk, 'callback'));
    const { res } = await loginCompleto();
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('state no coincide');
  });

  it('403 si el email no está verificado', async () => {
    crear(new ProveedorFalso({ ...identidadOk, emailVerificado: false }));
    const { res } = await loginCompleto();
    expect(res.statusCode).toBe(403);
  });

  it('403 si el dominio no es el requerido', async () => {
    crear(new ProveedorFalso({ ...identidadOk, dominio: 'otra.test' }), {
      ...ENV_AUTH,
      OIDC_DOMINIO_REQUERIDO: 'empresa.test',
    });
    const { res } = await loginCompleto();
    expect(res.statusCode).toBe(403);
  });

  it('acepta el dominio requerido', async () => {
    crear(new ProveedorFalso({ ...identidadOk, dominio: 'Empresa.test' }), {
      ...ENV_AUTH,
      OIDC_DOMINIO_REQUERIDO: 'empresa.test',
    });
    const { res } = await loginCompleto();
    expect(res.statusCode).toBe(302);
  });
});

describe('sesión', () => {
  it('/auth/me devuelve el usuario con sesión y 401 sin ella', async () => {
    crear();
    const sinSesion = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(sinSesion.statusCode).toBe(401);

    const { sesion } = await loginCompleto();
    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { plat_sesion: sesion ?? '' } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ sub: 'google-123', email: 'ana@ejemplo.test', nombre: 'Ana Prueba' });
  });

  it('una cookie de sesión sin firma válida no autentica', async () => {
    crear();
    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { plat_sesion: 'id-inventado.firma' } });
    expect(me.statusCode).toBe(401);
  });

  it('logout elimina la sesión', async () => {
    const { sesiones } = crear();
    const { sesion } = await loginCompleto();
    const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { plat_sesion: sesion ?? '' } });
    expect(out.statusCode).toBe(204);
    expect(sesiones.cantidad).toBe(0);
    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { plat_sesion: sesion ?? '' } });
    expect(me.statusCode).toBe(401);
  });

  it('cookies Secure fuera de localhost', async () => {
    crear(new ProveedorFalso(), { ...ENV_AUTH, PLATFORM_URL_PUBLICA: 'https://app.ejemplo.test' });
    const { res } = await iniciarLogin();
    expect(res.cookies.find((x) => x.name === 'plat_login')?.secure).toBe(true);
  });
});

describe('login deshabilitado', () => {
  it('responde 503 si falta la configuración', async () => {
    app = construirApp({ config: cargarConfig({ NODE_ENV: 'test' }) });
    for (const [method, url] of [
      ['GET', '/auth/login'],
      ['GET', '/auth/callback'],
      ['GET', '/auth/me'],
      ['POST', '/auth/logout'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(503);
    }
  });
});
