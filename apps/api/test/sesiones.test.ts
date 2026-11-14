import { describe, expect, it } from 'vitest';
import { AlmacenSesionesMemoria, type UsuarioSesion } from '../src/auth/sesiones.js';

const usuario: UsuarioSesion = { sub: 's1', email: 'ana@ejemplo.test', nombre: 'Ana', dominio: null };

describe('AlmacenSesionesMemoria', () => {
  it('crea ids opacos y únicos, y recupera la sesión', async () => {
    const a = new AlmacenSesionesMemoria({ ttlMs: 60_000 });
    const id1 = await a.crear(usuario);
    const id2 = await a.crear(usuario);
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await a.obtener(id1)).toEqual(usuario);
  });

  it('vence por TTL', async () => {
    let t = 0;
    const a = new AlmacenSesionesMemoria({ ttlMs: 1000, ahora: () => t });
    const id = await a.crear(usuario);
    t = 999;
    expect(await a.obtener(id)).not.toBeNull();
    t = 1000;
    expect(await a.obtener(id)).toBeNull();
    expect(a.cantidad).toBe(0);
  });

  it('elimina una sesión', async () => {
    const a = new AlmacenSesionesMemoria({ ttlMs: 60_000 });
    const id = await a.crear(usuario);
    await a.eliminar(id);
    expect(await a.obtener(id)).toBeNull();
  });

  it('respeta el máximo descartando la más antigua y purga vencidas', async () => {
    let t = 0;
    const a = new AlmacenSesionesMemoria({ ttlMs: 100, maxSesiones: 2, ahora: () => t });
    const id1 = await a.crear(usuario);
    const id2 = await a.crear(usuario);
    const id3 = await a.crear(usuario);
    expect(await a.obtener(id1)).toBeNull();
    expect(await a.obtener(id2)).not.toBeNull();
    expect(await a.obtener(id3)).not.toBeNull();
    t = 200;
    await a.crear(usuario);
    expect(a.cantidad).toBe(1);
  });

  it('id inexistente devuelve null', async () => {
    const a = new AlmacenSesionesMemoria({ ttlMs: 60_000 });
    expect(await a.obtener('no-existe')).toBeNull();
  });
});
