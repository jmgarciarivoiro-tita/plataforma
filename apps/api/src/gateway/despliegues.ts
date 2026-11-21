// I4-2b: módulos montados en el gateway a partir del mapa que escribe el deployer (ADR 0012, 0013).
// El mapa se relee cuando cambia (mtime), sin reiniciar la API. Si un cambio es inválido, se conserva
// la última versión válida, como con los roles.
import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import type { MapaModulos } from './modulos.js';

const ID = /^[a-z][a-z0-9-]{2,40}$/;
// El deployer publica los contenedores solo en loopback. Un mapa que apunte a otro host se rechaza:
// el gateway le manda a ese destino un JWT del usuario.
const HOSTS_PERMITIDOS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const esquemaMapa = z.object({
  modulos: z.record(
    z.string().regex(ID, 'id de módulo inválido'),
    z.looseObject({ url: z.string(), digest: z.string().regex(/^sha256:[a-f0-9]{64}$/, 'digest inválido') }),
  ),
});

/** Valida el JSON del deployer y devuelve id → URL. Lanza con un mensaje legible si algo no cumple. */
export function parsearMapaDespliegues(texto: string): Map<string, URL> {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('mapa de despliegues: JSON mal formado');
  }
  const r = esquemaMapa.safeParse(datos);
  if (!r.success) throw new Error(`mapa de despliegues inválido: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const mapa = new Map<string, URL>();
  for (const [id, e] of Object.entries(r.data.modulos)) {
    let url: URL;
    try {
      url = new URL(e.url);
    } catch {
      throw new Error(`mapa de despliegues: URL inválida para ${id}`);
    }
    if (url.protocol !== 'http:' || !HOSTS_PERMITIDOS.has(url.hostname) || url.pathname !== '/' || url.search || url.username) {
      throw new Error(`mapa de despliegues: ${id} debe apuntar a http://127.0.0.1:<puerto> sin ruta`);
    }
    mapa.set(id, url);
  }
  return mapa;
}

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void; error: (o: object, m: string) => void };
const SIN_LOG: Log = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Mapa vivo: módulos fijos de GATEWAY_MODULOS más los del archivo del deployer. Si un id está en los
 * dos, gana el del deployer (es el que pasó por el pipeline) y se avisa en el log.
 */
export class ModulosDesplegados implements MapaModulos {
  private actualesMap: Map<string, URL>;
  private desplegados = new Map<string, URL>();
  private mtimeMs: number | null = -1;
  log: Log = SIN_LOG;

  constructor(
    private readonly fijos: MapaModulos,
    private readonly ruta: string,
  ) {
    this.actualesMap = new Map(fijos);
  }

  private actuales(): Map<string, URL> {
    const mtime = this.mtimeActual();
    if (mtime === this.mtimeMs) return this.actualesMap;
    this.mtimeMs = mtime;
    if (mtime === null) {
      this.desplegados = new Map();
      this.log.warn({ ruta: this.ruta }, 'mapa de despliegues inexistente: solo módulos de GATEWAY_MODULOS');
    } else {
      try {
        this.desplegados = parsearMapaDespliegues(readFileSync(this.ruta, 'utf8'));
        this.log.info({ ruta: this.ruta, modulos: [...this.desplegados.keys()] }, 'mapa de despliegues cargado');
      } catch (err) {
        this.log.error({ err: err instanceof Error ? err.message : 'error' }, 'mapa de despliegues inválido: se mantiene la versión anterior');
        return this.actualesMap;
      }
    }
    const repetidos = [...this.desplegados.keys()].filter((id) => this.fijos.has(id));
    if (repetidos.length > 0) this.log.warn({ modulos: repetidos }, 'módulos en GATEWAY_MODULOS y en el mapa: se usa el del deployer');
    this.actualesMap = new Map([...this.fijos, ...this.desplegados]);
    return this.actualesMap;
  }

  private mtimeActual(): number | null {
    try {
      return statSync(this.ruta).mtimeMs;
    } catch {
      return null;
    }
  }

  get size() {
    return this.actuales().size;
  }
  get(id: string) {
    return this.actuales().get(id);
  }
  has(id: string) {
    return this.actuales().has(id);
  }
  forEach(fn: (v: URL, k: string, m: ReadonlyMap<string, URL>) => void) {
    this.actuales().forEach((v, k) => fn(v, k, this));
  }
  entries() {
    return this.actuales().entries();
  }
  keys() {
    return this.actuales().keys();
  }
  values() {
    return this.actuales().values();
  }
  [Symbol.iterator]() {
    return this.actuales()[Symbol.iterator]();
  }
}
