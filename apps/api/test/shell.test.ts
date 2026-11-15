import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../src/app.js';
import { crearEmisorJwt } from '../src/auth/emisor.js';
import type { ProveedorIdentidad } from '../src/auth/proveedor.js';
import { SIN_ROLES, type ProveedorRoles } from '../src/auth/roles.js';
import { AlmacenSesionesMemoria } from '../src/auth/sesiones.js';
import { cargarConfig } from '../src/config.js';
import { parsearModulos } from '../src/gateway/modulos.js';
import type { ModuloRegistry } from '../src/registry/registry.js';
import { CSP_SHELL, menuDelUsuario } from '../src/shell/rutas.js';

const mod = (id: string, seccion: string, orden: number, estado: ModuloRegistry['estado'] = 'en_desarrollo'): ModuloRegistry => ({
  id,
  nombre: `Nombre ${id}`,
  objetivo: 'x',
  area: 'x',
  empresas: ['acopio'],
  duenos: { product_owner: 'a', responsable_tecnico: 'b' },
  repo: 'r',
  plantilla: 'p',
  estado,
  riesgo: 'bajo',
  criticidad: 'baja',
  sox: { en_alcance: false, justificacion: 'x' },
  datos: { clasificacion: 'interna', datos_personales: false },
  agente: { habilitado: false },
  menu: { seccion, orden },
});

const registry = [mod('zeta', 'Comercial', 2), mod('alfa', 'Comercial', 1), mod('sis', 'Sistemas', 1), mod('viejo', 'Comercial', 0, 'retirado'), mod('sin-montar', 'Comercial', 0)];
const montados = parsearModulos('zeta=http://127.0.0.1:1,alfa=http://127.0.0.1:1,sis=http://127.0.0.1:1,viejo=http://127.0.0.1:1');

describe('menuDelUsuario', () => {
  it('filtra por montado, no retirado y con roles; ordena por sección y orden', () => {
    const menu = menuDelUsuario(registry, montados, { zeta: ['lector'], alfa: ['operador'], viejo: ['x'], 'sin-montar': ['x'], sis: [] });
    expect(menu.map((m) => m.id)).toEqual(['alfa', 'zeta']);
    expect(menu[0]).toEqual({ id: 'alfa', nombre: 'Nombre alfa', seccion: 'Comercial', url: '/m/alfa/' });
  });
});

describe('rutas del Shell', () => {
  let app: FastifyInstance;
  let dirShell: string;

  beforeAll(() => {
    dirShell = mkdtempSync(join(tmpdir(), 'shell-'));
    mkdirSync(join(dirShell, 'assets'));
    writeFileSync(join(dirShell, 'index.html'), '<!doctype html><title>Shell</title>');
    writeFileSync(join(dirShell, 'assets', 'app-123.js'), 'console.log(1)');
  });
  afterAll(() => rmSync(dirShell, { recursive: true, force: true }));
  afterEach(async () => {
    await app.close();
  });

  async function crear(dir: string) {
    const proveedor: ProveedorIdentidad = {
      urlLogin: async () => new URL('https://idp.test/auth'),
      completarLogin: async () => ({ sub: 's', email: 'ana@ejemplo.test', emailVerificado: true, nombre: 'Ana', dominio: null }),
    };
    const roles: ProveedorRoles = { obtenerRoles: async () => ({ ...SIN_ROLES, modulos: { alfa: ['operador'] } }) };
    app = construirApp({
      config: cargarConfig({ NODE_ENV: 'test', OIDC_CLIENT_ID: 'c', OIDC_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(40) }),
      emisor: await crearEmisorJwt({ issuer: 'http://localhost:8080' }),
      roles,
      modulos: montados,
      shell: { registry, dir },
      auth: { proveedor, sesiones: new AlmacenSesionesMemoria({ ttlMs: 60_000 }) },
    });
  }

  async function sesion(): Promise<string> {
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const tx = login.cookies.find((c) => c.name === 'plat_login')?.value ?? '';
    const cb = await app.inject({ method: 'GET', url: '/auth/callback?code=a&state=b', cookies: { plat_login: tx } });
    return cb.cookies.find((c) => c.name === 'plat_sesion')?.value ?? '';
  }

  it('/api/v1/shell/modulos exige sesión y devuelve el menú del usuario', async () => {
    await crear(dirShell);
    expect((await app.inject({ method: 'GET', url: '/api/v1/shell/modulos' })).statusCode).toBe(401);
    const res = await app.inject({ method: 'GET', url: '/api/v1/shell/modulos', cookies: { plat_sesion: await sesion() } });
    expect(res.json()).toEqual({ modulos: [{ id: 'alfa', nombre: 'Nombre alfa', seccion: 'Comercial', url: '/m/alfa/' }] });
  });

  it('/ sin sesión redirige al login; con sesión sirve el Shell con CSP', async () => {
    await crear(dirShell);
    const sin = await app.inject({ method: 'GET', url: '/' });
    expect(sin.statusCode).toBe(302);
    expect(sin.headers.location).toBe('/auth/login?returnTo=%2F');

    const con = await app.inject({ method: 'GET', url: '/?m=alfa', cookies: { plat_sesion: await sesion() } });
    expect(con.statusCode).toBe(200);
    expect(con.body).toContain('<title>Shell</title>');
    expect(con.headers['content-security-policy']).toBe(CSP_SHELL);
    expect(con.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(con.headers['cache-control']).toBe('no-store');
  });

  it('assets en /shell/ cacheables', async () => {
    await crear(dirShell);
    const res = await app.inject({ method: 'GET', url: '/shell/assets/app-123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sin build del Shell muestra un aviso', async () => {
    await crear(join(dirShell, 'no-existe'));
    const res = await app.inject({ method: 'GET', url: '/', cookies: { plat_sesion: await sesion() } });
    expect(res.body).toContain('no está compilado');
  });

  it('todas las respuestas llevan frame-ancestors propio', async () => {
    await crear(dirShell);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['content-security-policy']).toBe("frame-ancestors 'self'");
    expect(res.headers['referrer-policy']).toBe('same-origin');
  });
});
