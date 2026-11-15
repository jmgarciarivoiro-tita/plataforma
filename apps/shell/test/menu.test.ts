import { describe, expect, it, vi } from 'vitest';
import { crearApi, NoAutenticadoError } from '../src/api.js';
import { agruparPorSeccion, iniciales, moduloSeleccionado } from '../src/menu.js';

const m = (id: string, seccion: string) => ({ id, nombre: id.toUpperCase(), seccion, url: `/m/${id}/` });

describe('menú', () => {
  it('agrupa por sección conservando el orden', () => {
    const s = agruparPorSeccion([m('a', 'Comercial'), m('b', 'Sistemas'), m('c', 'Comercial')]);
    expect(s.map((x) => [x.nombre, x.modulos.map((y) => y.id)])).toEqual([
      ['Comercial', ['a', 'c']],
      ['Sistemas', ['b']],
    ]);
    expect(agruparPorSeccion([])).toEqual([]);
  });

  it('solo selecciona módulos que el usuario tiene', () => {
    const lista = [m('modulo-ejemplo', 'Sistemas')];
    expect(moduloSeleccionado('?m=modulo-ejemplo', lista)?.id).toBe('modulo-ejemplo');
    expect(moduloSeleccionado('?m=otro', lista)).toBeNull();
    expect(moduloSeleccionado('', lista)).toBeNull();
  });

  it('iniciales', () => {
    expect(iniciales('Juan Manuel Garcia', null)).toBe('JM');
    expect(iniciales(null, 'ana@ejemplo.test')).toBe('AN');
    expect(iniciales(null, null)).toBe('?');
    expect(iniciales('Ana', null)).toBe('AN');
  });
});

describe('api del Shell', () => {
  const respuesta = (status: number, cuerpo: unknown = {}) => new Response(JSON.stringify(cuerpo), { status });

  it('usuario y módulos', async () => {
    const f = vi.fn(async (url: string) =>
      url === '/auth/me' ? respuesta(200, { sub: 's', email: null, nombre: 'Ana' }) : respuesta(200, { modulos: [m('a', 'X')] }),
    );
    const api = crearApi(f);
    expect(await api.usuario()).toMatchObject({ nombre: 'Ana' });
    expect(await api.modulos()).toHaveLength(1);
    expect(f).toHaveBeenCalledWith('/auth/me', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('401 → NoAutenticadoError; otros errores → Error', async () => {
    await expect(crearApi(async () => respuesta(401)).usuario()).rejects.toBeInstanceOf(NoAutenticadoError);
    await expect(crearApi(async () => respuesta(500)).modulos()).rejects.toThrow(/Error 500/);
  });

  it('cerrar sesión hace POST', async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    await crearApi(f).cerrarSesion();
    expect(f).toHaveBeenCalledWith('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  });
});
