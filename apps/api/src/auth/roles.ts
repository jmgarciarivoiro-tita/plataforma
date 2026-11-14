// I1-3: roles del usuario. P2: la plataforma solo conoce ProveedorRoles.
// MVP: YAML local fuera del repo. Fase 1.5: grupos plat-* de Google Workspace (ADR-081).
import { readFileSync, statSync } from 'node:fs';
import type { FastifyBaseLogger } from 'fastify';
import { parse } from 'yaml';
import { z } from 'zod';
import type { UsuarioSesion } from './sesiones.js';

export const ROLES_PLATAFORMA = ['admin_plataforma', 'creador', 'revisor', 'auditor', 'usuario'] as const;
export type RolPlataforma = (typeof ROLES_PLATAFORMA)[number];

export interface RolesUsuario {
  plataforma: RolPlataforma[];
  /** id de módulo → roles declarados en su manifiesto. */
  modulos: Record<string, string[]>;
  empresas: string[];
}

export const SIN_ROLES: RolesUsuario = Object.freeze({ plataforma: [], modulos: {}, empresas: [] });

export interface ProveedorRoles {
  obtenerRoles(usuario: UsuarioSesion): Promise<RolesUsuario>;
}

/** Roles que van en un token según su audiencia: `plataforma` o `modulo:<id>`. */
export function rolesParaAudiencia(r: RolesUsuario, audiencia: string): string[] {
  if (audiencia === 'plataforma') return [...r.plataforma];
  const id = audiencia.startsWith('modulo:') ? audiencia.slice('modulo:'.length) : null;
  return id ? [...(r.modulos[id] ?? [])] : [];
}

const idModulo = z.string().regex(/^[a-z][a-z0-9-]{2,40}$/, 'id de módulo inválido');
const identificador = z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/, 'identificador inválido');

export const esquemaArchivoRoles = z
  .object({
    version: z.literal(1),
    usuarios: z
      .array(
        z
          .object({
            email: z.email().transform((e) => e.toLowerCase()),
            plataforma: z.array(z.enum(ROLES_PLATAFORMA)).default([]),
            empresas: z.array(identificador).default([]),
            modulos: z.record(idModulo, z.array(identificador)).default({}),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
  .superRefine((a, ctx) => {
    const vistos = new Set<string>();
    a.usuarios.forEach((u, i) => {
      if (vistos.has(u.email)) ctx.addIssue({ code: 'custom', path: ['usuarios', i, 'email'], message: 'email repetido' });
      vistos.add(u.email);
    });
  });

export type ArchivoRoles = z.infer<typeof esquemaArchivoRoles>;

/** Parsea y valida el contenido del YAML. Lanza un error legible si no es válido. */
export function parsearRoles(texto: string): Map<string, RolesUsuario> {
  let datos: unknown;
  try {
    datos = parse(texto);
  } catch (err) {
    throw new Error(`YAML de roles mal formado: ${err instanceof Error ? err.message : 'error'}`, { cause: err });
  }
  const r = esquemaArchivoRoles.safeParse(datos);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`YAML de roles inválido: ${detalle}`);
  }
  return new Map(
    r.data.usuarios.map((u) => [u.email, { plataforma: dedup(u.plataforma), modulos: u.modulos, empresas: dedup(u.empresas) }]),
  );
}

function dedup<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/**
 * Lee el YAML al crearse (si es inválido, la API no arranca) y lo relee cuando cambia.
 * Si un cambio posterior es inválido, conserva la última versión válida y lo registra.
 */
export class ProveedorRolesYaml implements ProveedorRoles {
  private roles = new Map<string, RolesUsuario>();
  private mtimeMs = -1;

  constructor(
    private readonly ruta: string,
    private readonly log: Pick<FastifyBaseLogger, 'warn' | 'error' | 'info'>,
  ) {
    const mtime = this.mtimeActual();
    if (mtime === null) {
      log.warn({ ruta }, 'archivo de roles inexistente: ningún usuario tiene roles');
      return;
    }
    this.roles = parsearRoles(readFileSync(ruta, 'utf8'));
    this.mtimeMs = mtime;
    log.info({ ruta, usuarios: this.roles.size }, 'roles cargados');
  }

  async obtenerRoles(usuario: UsuarioSesion): Promise<RolesUsuario> {
    this.recargarSiCambio();
    if (!usuario.email) return SIN_ROLES;
    return this.roles.get(usuario.email.toLowerCase()) ?? SIN_ROLES;
  }

  private recargarSiCambio(): void {
    const mtime = this.mtimeActual();
    if (mtime === null || mtime === this.mtimeMs) return;
    try {
      this.roles = parsearRoles(readFileSync(this.ruta, 'utf8'));
      this.log.info({ ruta: this.ruta, usuarios: this.roles.size }, 'roles recargados');
    } catch (err) {
      this.log.error({ err: err instanceof Error ? err.message : 'error' }, 'roles inválidos: se mantiene la versión anterior');
    }
    this.mtimeMs = mtime;
  }

  private mtimeActual(): number | null {
    try {
      return statSync(this.ruta).mtimeMs;
    } catch {
      return null;
    }
  }
}
