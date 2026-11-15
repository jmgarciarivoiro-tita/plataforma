import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cargarCatalogo, cargarExcepciones, sumarDias } from '../src/index.js';

const archivo = (contenido: string) => {
  const f = join(mkdtempSync(join(tmpdir(), 'cfg-')), 'x.yaml');
  writeFileSync(f, contenido);
  return f;
};
const real = join(import.meta.dirname, '../../../policies');
const catalogo = cargarCatalogo(join(real, 'catalogo.yaml'));
const exc = (vence: string, politica = 'COD-05') =>
  `excepciones:\n  - id: EXC-2026-001\n    modulo: notas\n    politica: ${politica}\n    detalle: d\n    mitigacion: m\n    vence: ${vence}\n    aprobado_por: [sistemas]\n`;

describe('catálogo', () => {
  it('el catálogo y las excepciones reales del repo son válidos', () => {
    expect(catalogo.politicas.map((p) => p.id)).toEqual(['ARQ-01', 'ARQ-06', 'SEG-12', 'GOB-06', 'COD-05']);
    expect(cargarExcepciones(join(real, 'excepciones.yaml'), catalogo, '2026-11-15')).toEqual([]);
  });

  it('rechaza check desconocido, IDs repetidos y cobertura sin umbral', () => {
    const p = (check: string, id = 'ARQ-01', extra = '') => `  - { id: ${id}, tipo: E, perfiles: [B], check: ${check}, descripcion: x${extra} }\n`;
    expect(() => cargarCatalogo(archivo(`version: 1\npoliticas:\n${p('inventado')}`))).toThrow('catálogo inválido');
    expect(() => cargarCatalogo(archivo(`version: 1\npoliticas:\n${p('estructura')}${p('estructura')}`))).toThrow('duplicadas');
    expect(() => cargarCatalogo(archivo(`version: 1\npoliticas:\n${p('cobertura', 'COD-05')}`))).toThrow('necesita umbral');
  });
});

describe('excepciones', () => {
  it('acepta hasta 90 días; más es inválido', () => {
    expect(cargarExcepciones(archivo(exc(sumarDias('2026-11-15', 90))), catalogo, '2026-11-15')[0]?.vence).toBe('2027-02-13');
    expect(() => cargarExcepciones(archivo(exc('2027-02-14')), catalogo, '2026-11-15')).toThrow('más de 90 días');
  });

  it('rechaza políticas que no existen y campos faltantes', () => {
    expect(() => cargarExcepciones(archivo(exc('2026-12-01', 'SEG-99')), catalogo, '2026-11-15')).toThrow('no está en el catálogo');
    expect(() => cargarExcepciones(archivo('excepciones:\n  - id: EXC-2026-001\n'), catalogo, '2026-11-15')).toThrow('excepciones inválidas');
  });
});
