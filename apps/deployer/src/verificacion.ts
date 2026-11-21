// Reglas que un pedido de despliegue tiene que cumplir ANTES de tocar Docker. Funciones puras.
import type { Pedido } from './tipos.js';

/** Quién puede pedir un despliegue: el GITHUB_TOKEN del workflow de publicación (github-actions[bot]). */
export const CREADOR_PERMITIDO = 'github-actions[bot]';
const DIGEST = /^sha256:[0-9a-f]{64}$/;

/** Tarea de los deployments de la plataforma: separa los pedidos de los que GitHub crea solo para cada job con environment. */
export const TAREA = 'deploy:plataforma';

export interface Destino {
  imagen: string;
  digest: string;
  /** Solo en producción: run de modulo-promover.yml que tiene las aprobaciones. */
  run?: number;
}

export interface PayloadPedido {
  imagen?: unknown;
  digest?: unknown;
  run_id?: unknown;
}

/** El payload llega como objeto o como texto JSON, según quién creó el deployment. */
export function leerPayload(payload: unknown): PayloadPedido {
  try {
    const p = typeof payload === 'string' ? (JSON.parse(payload || '{}') as unknown) : payload;
    return p && typeof p === 'object' ? (p as PayloadPedido) : {};
  } catch {
    return {};
  }
}

/** Valida el pedido y devuelve la imagen y el digest a desplegar; lanza un Error con el motivo. */
export function validarPedido(p: Pedido, o: { org: string; repo: string; entorno: string }): Destino {
  if (p.entorno !== o.entorno) throw new Error(`el pedido es para "${p.entorno}", no para "${o.entorno}"`);
  if (p.creador !== CREADOR_PERMITIDO) throw new Error(`pedido creado por "${p.creador}": solo se aceptan pedidos de los workflows de la plataforma`);
  const { imagen, digest, run_id } = leerPayload(p.payload);
  const esperada = `ghcr.io/${o.org}/${o.repo}`.toLowerCase();
  if (imagen !== esperada) throw new Error(`imagen "${String(imagen)}" no es la del módulo (${esperada})`);
  if (typeof digest !== 'string' || !DIGEST.test(digest)) throw new Error('digest inválido o ausente');
  if (o.entorno !== 'production') return { imagen, digest };
  if (typeof run_id !== 'number' || !Number.isSafeInteger(run_id) || run_id <= 0) throw new Error('falta el run de promoción (run_id)');
  return { imagen, digest, run: run_id };
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
