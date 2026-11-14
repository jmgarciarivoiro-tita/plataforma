import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parsearRoles, ProveedorRolesYaml, rolesParaAudiencia, SIN_ROLES } from '../src/auth/roles.js';
import type { UsuarioSesion } from '../src/auth/sesiones.js';

const valido = `
version: 1
usuarios:
  - email: Ana@Ejemplo.test
    plataforma: [admin_plataforma, creador, creador]
    empresas: [corretaje, acopio]
    modulos:
      contratos-granos: [operador]
  - email: beto@ejemplo.test
`;

const ana: UsuarioSesion = { sub: '1', email: 'ana@ejemplo.test', nombre: 'Ana', dominio: null };
const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('parsearRoles', () => {
  it('normaliza emails, quita duplicados y aplica valores por defecto', () => {
    const m = parsearRoles(valido);
    expect(m.get('ana@ejemplo.test')).toEqual({
      plataforma: ['admin_plataforma', 'creador'],
      empresas: ['corretaje', 'acopio'],
      modulos: { 'contratos-granos': ['operador'] },
    });
    expect(m.get('beto@ejemplo.test')).toEqual({ plataforma: [], empresas: [], modulos: {} });
  });

  it.each([
    ['rol de plataforma inexistente', 'version: 1\nusuarios:\n  - email: a@b.test\n    plataforma: [superadmin]'],
    ['email inválido', 'version: 1\nusuarios:\n  - email: no-es-email'],
    ['email repetido', 'version: 1\nusuarios:\n  - email: a@b.test\n  - email: A@B.test'],
    ['clave desconocida (typo)', 'version: 1\nusuarios:\n  - email: a@b.test\n    plataformas: [creador]'],
    ['id de módulo inválido', 'version: 1\nusuarios:\n  - email: a@b.test\n    modulos:\n      "../x": [operador]'],
    ['versión desconocida', 'version: 2\nusuarios: []'],
  ])('rechaza: %s', (_caso, texto) => {
    expect(() => parsearRoles(texto)).toThrow(/YAML de roles inválido/);
  });

  it('rechaza YAML mal formado', () => {
    expect(() => parsearRoles('version: 1\nusuarios: [\n')).toThrow(/mal formado/);
  });
});

describe('rolesParaAudiencia', () => {
  const r = parsearRoles(valido).get('ana@ejemplo.test') ?? SIN_ROLES;
  it('plataforma → roles de plataforma; módulo → roles de ese módulo', () => {
    expect(rolesParaAudiencia(r, 'plataforma')).toEqual(['admin_plataforma', 'creador']);
    expect(rolesParaAudiencia(r, 'modulo:contratos-granos')).toEqual(['operador']);
    expect(rolesParaAudiencia(r, 'modulo:otro')).toEqual([]);
    expect(rolesParaAudiencia(r, 'cualquiera')).toEqual([]);
  });
});

describe('ProveedorRolesYaml', () => {
  let dir: string;
  let ruta: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'roles-'));
    ruta = join(dir, 'roles.local.yaml');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sin archivo: avisa y nadie tiene roles', async () => {
    const l = log();
    const p = new ProveedorRolesYaml(ruta, l);
    expect(l.warn).toHaveBeenCalled();
    expect(await p.obtenerRoles(ana)).toEqual(SIN_ROLES);
  });

  it('archivo inválido al arrancar: lanza (la API no arranca)', () => {
    writeFileSync(ruta, 'version: 1\nusuarios:\n  - email: x');
    expect(() => new ProveedorRolesYaml(ruta, log())).toThrow(/inválido/);
  });

  it('busca por email sin distinguir mayúsculas; usuario sin email o no listado → sin roles', async () => {
    writeFileSync(ruta, valido);
    const p = new ProveedorRolesYaml(ruta, log());
    expect((await p.obtenerRoles({ ...ana, email: 'ANA@ejemplo.test' })).plataforma).toContain('creador');
    expect(await p.obtenerRoles({ ...ana, email: null })).toEqual(SIN_ROLES);
    expect(await p.obtenerRoles({ ...ana, email: 'otro@ejemplo.test' })).toEqual(SIN_ROLES);
  });

  it('relee el archivo cuando cambia', async () => {
    writeFileSync(ruta, valido);
    const p = new ProveedorRolesYaml(ruta, log());
    writeFileSync(ruta, 'version: 1\nusuarios:\n  - email: ana@ejemplo.test\n    plataforma: [auditor]');
    utimesSync(ruta, new Date(), new Date(Date.now() + 5000));
    expect((await p.obtenerRoles(ana)).plataforma).toEqual(['auditor']);
  });

  it('si el cambio es inválido, conserva la última versión válida y registra el error', async () => {
    writeFileSync(ruta, valido);
    const l = log();
    const p = new ProveedorRolesYaml(ruta, l);
    writeFileSync(ruta, 'version: 1\nusuarios:\n  - email: ana@ejemplo.test\n    plataforma: [superadmin]');
    utimesSync(ruta, new Date(), new Date(Date.now() + 5000));
    expect((await p.obtenerRoles(ana)).plataforma).toEqual(['admin_plataforma', 'creador']);
    expect(l.error).toHaveBeenCalled();
  });
});
