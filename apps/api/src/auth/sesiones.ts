// Sesiones del lado servidor. El navegador solo guarda un identificador opaco y firmado.
// MVP: en memoria (una instancia). Fase 1.5: implementación sobre Postgres con la misma interfaz.
import { randomBytes } from 'node:crypto';

export interface UsuarioSesion {
  sub: string;
  email: string | null;
  nombre: string | null;
  dominio: string | null;
}

export interface AlmacenSesiones {
  crear(usuario: UsuarioSesion): Promise<string>;
  obtener(id: string): Promise<UsuarioSesion | null>;
  eliminar(id: string): Promise<void>;
}

interface Entrada {
  usuario: UsuarioSesion;
  vence: number;
}

export interface OpcionesMemoria {
  ttlMs: number;
  maxSesiones?: number;
  ahora?: () => number;
}

export class AlmacenSesionesMemoria implements AlmacenSesiones {
  private readonly sesiones = new Map<string, Entrada>();
  private readonly ttlMs: number;
  private readonly maxSesiones: number;
  private readonly ahora: () => number;

  constructor(o: OpcionesMemoria) {
    this.ttlMs = o.ttlMs;
    this.maxSesiones = o.maxSesiones ?? 10_000;
    this.ahora = o.ahora ?? Date.now;
  }

  async crear(usuario: UsuarioSesion): Promise<string> {
    this.purgarVencidas();
    if (this.sesiones.size >= this.maxSesiones) {
      // Descarta la más antigua (Map conserva el orden de inserción).
      const primera = this.sesiones.keys().next();
      if (!primera.done) this.sesiones.delete(primera.value);
    }
    const id = randomBytes(32).toString('base64url');
    this.sesiones.set(id, { usuario, vence: this.ahora() + this.ttlMs });
    return id;
  }

  async obtener(id: string): Promise<UsuarioSesion | null> {
    const entrada = this.sesiones.get(id);
    if (!entrada) return null;
    if (entrada.vence <= this.ahora()) {
      this.sesiones.delete(id);
      return null;
    }
    return entrada.usuario;
  }

  async eliminar(id: string): Promise<void> {
    this.sesiones.delete(id);
  }

  get cantidad(): number {
    return this.sesiones.size;
  }

  private purgarVencidas(): void {
    const t = this.ahora();
    for (const [id, e] of this.sesiones) if (e.vence <= t) this.sesiones.delete(id);
  }
}
