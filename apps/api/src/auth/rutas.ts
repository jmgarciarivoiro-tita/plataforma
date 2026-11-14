// I1-1: login OIDC (authorization code + PKCE + state + nonce) y sesión con cookie firmada.
import * as client from 'openid-client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { enviarProblema } from '../http/problema.js';
import type { ProveedorIdentidad } from './proveedor.js';
import { SIN_ROLES, type ProveedorRoles } from './roles.js';
import type { AlmacenSesiones, UsuarioSesion } from './sesiones.js';

export const COOKIE_SESION = 'plat_sesion';
export const COOKIE_LOGIN = 'plat_login';
const VIDA_LOGIN_S = 600;

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario de la sesión, o null si no hay sesión válida. */
    usuario: UsuarioSesion | null;
  }
}

export interface OpcionesAuth {
  proveedor: ProveedorIdentidad;
  sesiones: AlmacenSesiones;
  urlPublica: string;
  ttlSesionMin: number;
  cookiesSeguras: boolean;
  dominioRequerido?: string | undefined;
  roles?: ProveedorRoles;
}

// Solo rutas relativas internas: evita redirecciones abiertas (//otro.sitio, /\otro, esquemas).
const rutaInterna = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\s\\]*$/, 'returnTo debe ser una ruta interna');

const consultaLogin = z.object({ returnTo: rutaInterna.default('/') });

const transaccion = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  verifier: z.string().min(43),
  returnTo: rutaInterna,
});
type Transaccion = z.infer<typeof transaccion>;

function sinCache(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
}

export function registrarRutasAuth(app: FastifyInstance, o: OpcionesAuth): void {
  const base = { httpOnly: true, sameSite: 'lax' as const, secure: o.cookiesSeguras, signed: true };

  // Carga el usuario de la sesión en cada request (lo usarán el gateway y el Shell).
  app.decorateRequest('usuario', null);
  app.addHook('onRequest', async (req) => {
    const id = leerCookieFirmada(req, COOKIE_SESION);
    req.usuario = id ? await o.sesiones.obtener(id) : null;
  });

  app.get('/auth/login', async (req, reply) => {
    sinCache(reply);
    const consulta = consultaLogin.safeParse(req.query);
    if (!consulta.success) return enviarProblema(req, reply, 400, 'Parámetro returnTo inválido');

    const tx: Transaccion = {
      state: client.randomState(),
      nonce: client.randomNonce(),
      verifier: client.randomPKCECodeVerifier(),
      returnTo: consulta.data.returnTo,
    };
    let destino: URL;
    try {
      destino = await o.proveedor.urlLogin({
        state: tx.state,
        nonce: tx.nonce,
        codeChallenge: await client.calculatePKCECodeChallenge(tx.verifier),
      });
    } catch (err) {
      req.log.error({ err }, 'no se pudo contactar al proveedor de identidad');
      return enviarProblema(req, reply, 502, 'Proveedor de identidad no disponible');
    }
    reply.setCookie(COOKIE_LOGIN, JSON.stringify(tx), { ...base, path: '/auth', maxAge: VIDA_LOGIN_S });
    return reply.redirect(destino.toString(), 302);
  });

  app.get('/auth/callback', async (req, reply) => {
    sinCache(reply);
    reply.clearCookie(COOKIE_LOGIN, { path: '/auth' });

    const crudo = leerCookieFirmada(req, COOKIE_LOGIN);
    const tx = crudo ? transaccion.safeParse(parsearJson(crudo)) : null;
    if (!tx?.success) return enviarProblema(req, reply, 400, 'Login inválido o vencido; volvé a intentarlo');

    const query = req.query as Record<string, unknown>;
    if (typeof query.error === 'string') {
      req.log.warn({ errorIdp: query.error }, 'el proveedor de identidad rechazó el login');
      return enviarProblema(req, reply, 401, 'El login fue cancelado o rechazado');
    }

    const urlCallback = new URL(req.url, o.urlPublica);
    let identidad;
    try {
      identidad = await o.proveedor.completarLogin(urlCallback, {
        state: tx.data.state,
        nonce: tx.data.nonce,
        codeVerifier: tx.data.verifier,
      });
    } catch (err) {
      // No se loguea la URL (contiene el código de autorización).
      req.log.warn({ err: err instanceof Error ? err.message : 'desconocido' }, 'validación del login fallida');
      return enviarProblema(req, reply, 401, 'No se pudo validar el login');
    }

    if (!identidad.emailVerificado || !identidad.email) {
      return enviarProblema(req, reply, 403, 'La cuenta no tiene un email verificado');
    }
    if (o.dominioRequerido && identidad.dominio?.toLowerCase() !== o.dominioRequerido.toLowerCase()) {
      req.log.warn({ sub: identidad.sub }, 'login de un dominio no autorizado');
      return enviarProblema(req, reply, 403, 'La cuenta no pertenece a la organización');
    }

    const id = await o.sesiones.crear({
      sub: identidad.sub,
      email: identidad.email,
      nombre: identidad.nombre,
      dominio: identidad.dominio,
    });
    reply.setCookie(COOKIE_SESION, id, { ...base, path: '/', maxAge: o.ttlSesionMin * 60 });
    req.log.info({ sub: identidad.sub }, 'login exitoso');
    return reply.redirect(tx.data.returnTo, 302);
  });

  app.get('/auth/me', async (req, reply) => {
    sinCache(reply);
    if (!req.usuario) return enviarProblema(req, reply, 401, 'No autenticado');
    const { sub, email, nombre } = req.usuario;
    const roles = o.roles ? await o.roles.obtenerRoles(req.usuario) : SIN_ROLES;
    return { sub, email, nombre, roles };
  });

  // POST + cookie SameSite=Lax: un sitio externo no puede cerrar la sesión con un enlace.
  app.post('/auth/logout', async (req, reply) => {
    sinCache(reply);
    const id = leerCookieFirmada(req, COOKIE_SESION);
    if (id) await o.sesiones.eliminar(id);
    reply.clearCookie(COOKIE_SESION, { path: '/' });
    return reply.code(204).send();
  });
}

/** Login deshabilitado (falta configuración): responde 503 sin romper el resto de la API. */
export function registrarAuthDeshabilitada(app: FastifyInstance): void {
  app.decorateRequest('usuario', null);
  const noDisponible = async (req: FastifyRequest, reply: FastifyReply) =>
    enviarProblema(req, reply, 503, 'Login no configurado (falta OIDC_CLIENT_ID)');
  app.get('/auth/login', noDisponible);
  app.get('/auth/callback', noDisponible);
  app.get('/auth/me', noDisponible);
  app.post('/auth/logout', noDisponible);
}

function leerCookieFirmada(req: FastifyRequest, nombre: string): string | null {
  const valor = req.cookies[nombre];
  if (!valor) return null;
  const r = req.unsignCookie(valor);
  return r.valid && r.value ? r.value : null;
}

function parsearJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}
