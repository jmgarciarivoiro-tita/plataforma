import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cargarRegistry } from '../src/registry/registry.js';

const base = `id: mod-a
nombre: Módulo A
objetivo: Probar el registry.
area: Sistemas
empresas: [acopio]
duenos: { product_owner: po-a, responsable_tecnico: rt-a }
repo: modulo-a
plantilla: plantilla-modulo@0.1.0
estado: en_desarrollo
riesgo: bajo
criticidad: baja
sox: { en_alcance: false, justificacion: Prueba. }
datos: { clasificacion: interna, datos_personales: false }
agente: { habilitado: false }
menu: { seccion: Sistemas, orden: 1 }
`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'registry-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('cargarRegistry', () => {
  it('carga el registry real del repo', () => {
    const r = cargarRegistry(join(process.cwd(), '../../registry'));
    expect(r.map((m) => m.id)).toContain('modulo-ejemplo');
  });

  it('carpeta inexistente → vacío', () => {
    expect(cargarRegistry(join(dir, 'no-existe'))).toEqual([]);
  });

  it('carga un módulo válido', () => {
    writeFileSync(join(dir, 'mod-a.yaml'), base);
    expect(cargarRegistry(dir)[0]).toMatchObject({ id: 'mod-a', riesgo: 'bajo' });
  });

  it.each([
    ['id distinto del archivo', 'otro.yaml', base],
    ['email en un campo', 'mod-a.yaml', base.replace('po-a', 'po@empresa.test')],
    ['URL en un campo', 'mod-a.yaml', base.replace('repo: modulo-a', 'repo: https://github.com/x/y')],
    ['clave desconocida', 'mod-a.yaml', `${base}extra: 1\n`],
    ['datos personales con riesgo bajo', 'mod-a.yaml', base.replace('datos_personales: false', 'datos_personales: true')],
    [
      'riesgo alto con PO = responsable técnico',
      'mod-a.yaml',
      base.replace('riesgo: bajo', 'riesgo: alto').replace('rt-a', 'po-a'),
    ],
  ])('rechaza: %s', (_c, archivo, contenido) => {
    writeFileSync(join(dir, archivo), contenido);
    expect(() => cargarRegistry(dir)).toThrow(/Registry inválido/);
  });
});
