import type { ModuloRegistry } from '@plataforma/contracts';
import type { ClienteGitHub, Metodo } from '@plataforma/github';
import type { Contenedor, Docker, EntradaMapa, Mapa, OpcionesRun, Salud, VerificadorAtestacion } from '../src/tipos.js';

export const ORG = 'org-test';
export const DIGEST_A = `sha256:${'a'.repeat(64)}`;
export const DIGEST_B = `sha256:${'b'.repeat(64)}`;

export function modulo(extra: Partial<ModuloRegistry> = {}): ModuloRegistry {
  return {
    id: 'notas', nombre: 'Notas', objetivo: 'x', area: 'Sistemas', empresas: ['acopio'],
    duenos: { product_owner: 'po', responsable_tecnico: 'rt' }, repo: 'modulo-notas', plantilla: 'plantilla-modulo@0.4.0',
    estado: 'en_desarrollo', riesgo: 'bajo', criticidad: 'baja', sox: { en_alcance: false, justificacion: 'x' },
    datos: { clasificacion: 'interna', datos_personales: false }, agente: { habilitado: false }, menu: { seccion: 'S', orden: 1 },
    ...extra,
  };
}

export interface DeploymentFalso {
  id: number;
  environment?: string;
  creador?: string;
  payload?: unknown;
  created_at?: string;
  estados?: string[];
}

export class GitHubFalso implements ClienteGitHub {
  llamadas: { metodo: Metodo; ruta: string; cuerpo?: unknown }[] = [];
  constructor(public deployments: DeploymentFalso[]) {}
  async pedir<T>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> {
    this.llamadas.push({ metodo, ruta, ...(cuerpo === undefined ? {} : { cuerpo }) });
    const r = (x: unknown) => x as T;
    let m: RegExpExecArray | null;
    if (/\/deployments\?environment=/.test(ruta)) {
      return r(this.deployments.map((d) => ({ id: d.id, sha: 'abc', environment: d.environment ?? 'staging', creator: { login: d.creador ?? 'github-actions[bot]' }, payload: d.payload ?? { imagen: `ghcr.io/${ORG}/modulo-notas`, digest: DIGEST_A }, created_at: d.created_at ?? `2026-11-17T10:00:0${d.id}Z` })));
    }
    if ((m = /\/deployments\/(\d+)\/statuses/.exec(ruta))) {
      const d = this.deployments.find((x) => x.id === Number(m?.[1]));
      if (metodo === 'POST') {
        d?.estados?.unshift((cuerpo as { state: string }).state);
        if (d && !d.estados) d.estados = [(cuerpo as { state: string }).state];
        return r({});
      }
      return r((d?.estados ?? []).slice(0, 1).map((state) => ({ state })));
    }
    throw new Error(`ruta no simulada: ${metodo} ${ruta}`);
  }
  async buscar<T>(): Promise<T | null> {
    return null;
  }
  estados(id: number) {
    return this.llamadas.filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/deployments/${id}/statuses`)).map((l) => l.cuerpo as { state: string; description: string });
  }
}

export class DockerFalso implements Docker {
  contenedores: Contenedor[] = [];
  ejecutados: OpcionesRun[] = [];
  eliminados: string[] = [];
  descargados: string[] = [];
  fallarEn: 'descargar' | 'ejecutar' | null = null;
  async descargar(imagen: string) {
    if (this.fallarEn === 'descargar') throw new Error('pull denegado');
    this.descargados.push(imagen);
  }
  async listar() {
    return [...this.contenedores];
  }
  async ejecutar(o: OpcionesRun) {
    if (this.fallarEn === 'ejecutar') throw new Error('puerto ocupado');
    this.ejecutados.push(o);
    this.contenedores.push({ nombre: o.nombre, modulo: o.etiquetas['plataforma.modulo'] ?? '', entorno: o.etiquetas['plataforma.entorno'] ?? '', digest: o.etiquetas['plataforma.digest'] ?? '', puerto: o.puerto });
  }
  async eliminar(nombre: string) {
    this.eliminados.push(nombre);
    this.contenedores = this.contenedores.filter((c) => c.nombre !== nombre);
  }
  async logs() {
    return 'Error: no arranca';
  }
}

export class AtestacionFalsa implements VerificadorAtestacion {
  verificadas: string[] = [];
  constructor(private readonly error: string | null = null) {}
  async verificar(imagen: string, digest: string, repo: string) {
    if (this.error) throw new Error(this.error);
    this.verificadas.push(`${imagen}@${digest} ${repo}`);
  }
}

export const saludFalsa = (ok: boolean): Salud => ({ esperar: async () => ok });

export class MapaFalso implements Mapa {
  datos: Record<string, EntradaMapa> = {};
  async leer() {
    return this.datos;
  }
  async escribir(id: string, e: EntradaMapa) {
    this.datos[id] = e;
  }
}
