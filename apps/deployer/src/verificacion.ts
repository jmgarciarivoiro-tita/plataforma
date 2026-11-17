// Reglas que un pedido de despliegue tiene que cumplir ANTES de tocar Docker. Funciones puras.
import type { Pedido } from './tipos.js';

/** Quién puede pedir un despliegue: el GITHUB_TOKEN del workflow de publicación (github-actions[bot]). */
export const CREADOR_PERMITIDO = 'github-actions[bot]';
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export interface Destino {
  imagen: string;
  digest: string;
}

/** Valida el pedido y devuelve la imagen y el digest a desplegar; lanza un Error con el motivo. */
export function validarPedido(p: Pedido, o: { org: string; repo: string; entorno: string }): Destino {
  if (p.entorno !== o.entorno) throw new Error(`el pedido es para "${p.entorno}", no para "${o.entorno}"`);
  if (p.creador !== CREADOR_PERMITIDO) throw new Error(`pedido creado por "${p.creador}": solo se aceptan pedidos del workflow de publicación`);
  const payload = typeof p.payload === 'string' ? (JSON.parse(p.payload || '{}') as unknown) : p.payload;
  const { imagen, digest } = (payload ?? {}) as { imagen?: unknown; digest?: unknown };
  const esperada = `ghcr.io/${o.org}/${o.repo}`.toLowerCase();
  if (imagen !== esperada) throw new Error(`imagen "${String(imagen)}" no es la del módulo (${esperada})`);
  if (typeof digest !== 'string' || !DIGEST.test(digest)) throw new Error('digest inválido o ausente');
  return { imagen, digest };
}

/** Nombre del contenedor: entorno, módulo y digest corto (único por versión). */
export function nombreContenedor(entorno: string, id: string, digest: string): string {
  return `plat-${entorno}-${id}-${digest.slice(7, 19)}`;
}

/** Primer puerto libre del rango, sin repetir ninguno en uso. */
export function puertoLibre(rango: [number, number], usados: number[]): number {
  const ocupados = new Set(usados);
  for (let p = rango[0]; p <= rango[1]; p++) if (!ocupados.has(p)) return p;
  throw new Error(`no hay puertos libres entre ${rango[0]} y ${rango[1]}`);
}

/** Texto para GitHub (máximo 140 caracteres). */
export function descripcion(texto: string): string {
  return texto.length <= 140 ? texto : `${texto.slice(0, 137)}...`;
}
