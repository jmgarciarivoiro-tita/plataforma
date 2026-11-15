import { describe, expect, it } from 'vitest';
import { anotaciones, markdown, paraIa, type ResultadoEvaluacion } from '../src/index.js';

const r: ResultadoEvaluacion = {
  modulo: 'notas',
  repo: 'modulo-notas',
  perfil: 'M',
  bloquea: true,
  politicas: [
    { id: 'SEG-12', tipo: 'E', descripcion: 'Cadena', estado: 'falla', fallas: [{ mensaje: 'a: versión "^1"', archivo: 'package.json', linea: 5, sugerencia: 'Fijá 1.2.3.' }] },
    { id: 'COD-05', tipo: 'E', descripcion: 'Cobertura', estado: 'exceptuada', fallas: [{ mensaje: 'baja', sugerencia: 'tests' }], excepcion: 'EXC-2026-001 (vence 2026-12-31)' },
    { id: 'ARQ-01', tipo: 'E', descripcion: 'Estructura | repo', estado: 'ok', fallas: [] },
  ],
};

describe('salidas', () => {
  it('markdown con veredicto y tabla', () => {
    const md = markdown(r);
    expect(md).toContain('❌ Bloquea el merge');
    expect(md).toContain('Excepción EXC-2026-001');
    expect(md).toContain('Estructura | repo');
    expect(markdown({ ...r, bloquea: false })).toContain('✅ Políticas exigibles cumplidas');
  });

  it('anotaciones de GitHub con archivo y línea; las exceptuadas como advertencia', () => {
    expect(anotaciones(r)).toEqual(['::error file=package.json,line=5,title=SEG-12::a: versión "^1". Fijá 1.2.3.', '::warning title=COD-05::baja. tests']);
  });

  it('JSON para la IA con archivo, línea y sugerencia', () => {
    expect(paraIa(r).hallazgos[0]).toEqual({ politica: 'SEG-12', ok: false, mensaje: 'a: versión "^1"', archivo: 'package.json', linea: 5, sugerencia: 'Fijá 1.2.3.' });
    expect(paraIa(r).hallazgos[1]?.ok).toBe(true);
  });
});
