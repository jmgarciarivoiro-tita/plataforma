// Lógica pura del menú (testeable sin navegador).
import type { Modulo } from './api.js';

export interface Seccion {
  nombre: string;
  modulos: Modulo[];
}

/** Agrupa por sección conservando el orden que define la API. */
export function agruparPorSeccion(modulos: Modulo[]): Seccion[] {
  const secciones: Seccion[] = [];
  for (const m of modulos) {
    let s = secciones.find((x) => x.nombre === m.seccion);
    if (!s) {
      s = { nombre: m.seccion, modulos: [] };
      secciones.push(s);
    }
    s.modulos.push(m);
  }
  return secciones;
}

/** Módulo seleccionado según `?m=<id>`; solo si el usuario lo tiene en su menú. */
export function moduloSeleccionado(search: string, modulos: Modulo[]): Modulo | null {
  const id = new URLSearchParams(search).get('m');
  return modulos.find((m) => m.id === id) ?? null;
}

/** Iniciales para el avatar del usuario. */
export function iniciales(nombre: string | null, email: string | null): string {
  const base = (nombre ?? email ?? '?').trim();
  const partes = base.split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? `${partes[0]?.[0] ?? ''}${partes[1]?.[0] ?? ''}` : base.slice(0, 2);
  return letras.toUpperCase();
}
