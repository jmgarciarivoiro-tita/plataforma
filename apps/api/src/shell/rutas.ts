// I1-5: API del Shell y servido de la SPA con cabeceras de seguridad.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { ProveedorRoles } from '../auth/roles.js';
import { SIN_ROLES } from '../auth/roles.js';
import type { MapaModulos } from '../gateway/modulos.js';
import { enviarProblema } from '../http/problema.js';
import type { ModuloRegistry } from '../registry/registry.js';

export interface EntradaMenu {
  id: string;
  nombre: string;
  seccion: string;
  url: string;
}

/** Módulos visibles para el usuario: montados, no retirados y con algún rol suyo. Orden: sección, orden, nombre. */
export function menuDelUsuario(registry: ModuloRegistry[], montados: MapaModulos, rolesPorModulo: Record<string, string[]>): EntradaMenu[] {
  return registry
    .filter((m) => montados.has(m.id) && m.estado !== 'retirado' && (rolesPorModulo[m.id]?.length ?? 0) > 0)
    .sort((a, b) => a.menu.seccion.localeCompare(b.menu.seccion, 'es') || a.menu.orden - b.menu.orden || a.nombre.localeCompare(b.nombre, 'es'))
    .map((m) => ({ id: m.id, nombre: m.nombre, seccion: m.menu.seccion, url: `/m/${m.id}/` }));
}

// CSP del Shell: todo del mismo origen; iframes solo propios; nadie puede embeber la plataforma.
// 'unsafe-inline' en estilos: Mantine aplica estilos en atributos `style`.
export const CSP_SHELL = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

export interface OpcionesShell {
  registry: ModuloRegistry[];
  modulos: MapaModulos;
  roles?: ProveedorRoles | undefined;
  /** Carpeta con el build de apps/shell. Si no existe, `/` muestra un aviso. */
  dirShell: string;
}

export async function registrarShell(app: FastifyInstance, o: OpcionesShell): Promise<void> {
  app.get('/api/v1/shell/modulos', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!req.usuario) return enviarProblema(req, reply, 401, 'No autenticado');
    const r = o.roles ? await o.roles.obtenerRoles(req.usuario) : SIN_ROLES;
    return { modulos: menuDelUsuario(o.registry, o.modulos, r.modulos) };
  });

  const index = join(o.dirShell, 'index.html');
  const hayBuild = existsSync(index);
  if (hayBuild) {
    await app.register(fastifyStatic, {
      root: o.dirShell,
      prefix: '/shell/',
      index: false,
      // Los assets de Vite llevan hash en el nombre: se pueden cachear mucho tiempo.
      maxAge: '1y',
      immutable: true,
    });
  }

  app.get('/', async (req, reply) => {
    if (!req.usuario) return reply.redirect('/auth/login?returnTo=%2F', 302);
    if (!hayBuild) {
      return reply
        .type('text/plain; charset=utf-8')
        .send('El Shell no está compilado. Ejecutá `pnpm dev` o `pnpm build` y recargá.');
    }
    reply.header('content-security-policy', CSP_SHELL).header('cache-control', 'no-store');
    return reply.sendFile('index.html', o.dirShell, { cacheControl: false });
  });
}
