import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearMapa } from '../src/mapa.js';
import { crearSalud } from '../src/salud.js';
import { descripcion, nombreContenedor, puertoLibre } from '../src/verificacion.js';

describe('utilidades', () => {
  it('puertos: el primero libre; error si no queda ninguno', () => {
    expect(puertoLibre([4100, 4103], [4100, 4102])).toBe(4101);
    expect(() => puertoLibre([4100, 4101], [4100, 4101])).toThrow('no hay puertos libres');
  });

  it('nombre del contenedor y descripción para GitHub (máx. 140)', () => {
    expect(nombreContenedor('production', 'notas', `sha256:${'c'.repeat(64)}`)).toBe('plat-production-notas-cccccccccccc');
    expect(descripcion('x'.repeat(200))).toHaveLength(140);
    expect(descripcion('corto')).toBe('corto');
  });

  it('mapa: crea el archivo, conserva los otros módulos y escribe JSON completo', async () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'mapa-')), 'sub', 'despliegues.staging.json');
    const mapa = crearMapa(ruta);
    expect(await mapa.leer()).toEqual({});
    await mapa.escribir('a', { url: 'http://127.0.0.1:4100', digest: 'sha256:1', pedido: 1, desplegado: 't' });
    await mapa.escribir('b', { url: 'http://127.0.0.1:4101', digest: 'sha256:2', pedido: 2, desplegado: 't' });
    expect(Object.keys((JSON.parse(readFileSync(ruta, 'utf8')) as { modulos: object }).modulos)).toEqual(['a', 'b']);
  });

  it('salud: espera /health y exige el id en /meta', async () => {
    const respuestas = (id: string, fallos = 0) => {
      let n = 0;
      return (async (url: string) => {
        if (url.endsWith('/health') && n++ < fallos) throw new Error('ECONNREFUSED');
        return new Response(url.endsWith('/meta') ? JSON.stringify({ id }) : '{"estado":"ok"}', { status: 200 });
      }) as unknown as typeof fetch;
    };
    expect(await crearSalud({ esperaMs: 1, fetchFn: respuestas('notas', 2) }).esperar(4100, 'notas')).toBe(true);
    expect(await crearSalud({ esperaMs: 1, fetchFn: respuestas('otro') }).esperar(4100, 'notas')).toBe(false);
    expect(await crearSalud({ esperaMs: 1, intentos: 3, fetchFn: respuestas('notas', 99) }).esperar(4100, 'notas')).toBe(false);
  });
});
