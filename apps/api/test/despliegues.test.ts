import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModulosDesplegados, parsearMapaDespliegues } from '../src/gateway/despliegues.js';
import { parsearModulos } from '../src/gateway/modulos.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const json = (modulos: Record<string, unknown>) => JSON.stringify({ modulos });

describe('parsearMapaDespliegues', () => {
  it('lee el archivo del deployer', () => {
    const m = parsearMapaDespliegues(json({ 'tareas-piloto': { url: 'http://127.0.0.1:4100', digest: DIGEST, pedido: 7, desplegado: 't' } }));
    expect(m.get('tareas-piloto')?.toString()).toBe('http://127.0.0.1:4100/');
  });

  it.each([
    ['JSON roto', '{', /mal formado/],
    ['sin modulos', '{}', /inválido/],
    ['id inválido', json({ X: { url: 'http://127.0.0.1:1', digest: DIGEST } }), /modulos\.X/],
    ['digest inválido', json({ 'tareas-piloto': { url: 'http://127.0.0.1:1', digest: 'latest' } }), /digest/],
    ['URL inválida', json({ 'tareas-piloto': { url: 'nada', digest: DIGEST } }), /URL inválida/],
    ['host externo (exfiltraría el JWT)', json({ 'tareas-piloto': { url: 'http://atacante.test:80', digest: DIGEST } }), /127\.0\.0\.1/],
    ['https a otro host', json({ 'tareas-piloto': { url: 'https://10.0.0.5:443', digest: DIGEST } }), /127\.0\.0\.1/],
    ['con ruta', json({ 'tareas-piloto': { url: 'http://127.0.0.1:4100/x', digest: DIGEST } }), /127\.0\.0\.1/],
  ])('rechaza: %s', (_c, texto, error) => {
    expect(() => parsearMapaDespliegues(texto)).toThrow(error);
  });
});

describe('ModulosDesplegados', () => {
  function preparar() {
    const ruta = join(mkdtempSync(join(tmpdir(), 'mapa-')), 'despliegues.staging.json');
    const logs: string[] = [];
    const m = new ModulosDesplegados(parsearModulos('modulo-ejemplo=http://127.0.0.1:3101'), ruta);
    m.log = { info: (_o, t) => logs.push(`info ${t}`), warn: (_o, t) => logs.push(`warn ${t}`), error: (_o, t) => logs.push(`error ${t}`) };
    let segundo = 1_000_000;
    const escribir = (texto: string) => {
      writeFileSync(ruta, texto);
      segundo += 10; // mtime distinto en cada escritura, aunque caigan en el mismo milisegundo
      utimesSync(ruta, segundo, segundo);
    };
    return { ruta, m, logs, escribir };
  }

  it('sin archivo: solo los módulos fijos', () => {
    const { m, logs } = preparar();
    expect([...m.keys()]).toEqual(['modulo-ejemplo']);
    expect(logs).toEqual(['warn mapa de despliegues inexistente: solo módulos de GATEWAY_MODULOS']);
  });

  it('recarga en caliente, conserva la última versión válida y vuelve a los fijos si se borra', () => {
    const { ruta, m, logs, escribir } = preparar();
    escribir(json({ 'tareas-piloto': { url: 'http://127.0.0.1:4100', digest: DIGEST } }));
    expect(m.get('tareas-piloto')?.port).toBe('4100');
    expect(m.size).toBe(2);
    expect(m.has('modulo-ejemplo')).toBe(true);

    escribir(json({ 'tareas-piloto': { url: 'http://atacante.test:80', digest: DIGEST } }));
    expect(m.get('tareas-piloto')?.port).toBe('4100');
    expect(logs.at(-1)).toBe('error mapa de despliegues inválido: se mantiene la versión anterior');

    escribir(json({ 'tareas-piloto': { url: 'http://127.0.0.1:4101', digest: DIGEST } }));
    expect(m.get('tareas-piloto')?.port).toBe('4101');

    rmSync(ruta);
    expect(m.has('tareas-piloto')).toBe(false);
    expect([...m.entries()].map(([id]) => id)).toEqual(['modulo-ejemplo']);
  });

  it('si un id está en los dos, gana el del deployer y queda en el log', () => {
    const { m, logs, escribir } = preparar();
    escribir(json({ 'modulo-ejemplo': { url: 'http://127.0.0.1:4200', digest: DIGEST } }));
    expect(m.get('modulo-ejemplo')?.port).toBe('4200');
    expect(logs).toContain('warn módulos en GATEWAY_MODULOS y en el mapa: se usa el del deployer');
    const vistos: string[] = [];
    m.forEach((_u, id, mapa) => vistos.push(`${id}:${mapa.size}`));
    expect(vistos).toEqual(['modulo-ejemplo:1']);
    expect([...m.values()].map((u) => u.port)).toEqual(['4200']);
    expect([...m].length).toBe(1);
  });
});
