// Construcción de la app Fastify, separada del arranque para poder testearla con inject().
import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { EmisorJwt } from './auth/emisor.js';
import { registrarRutasAuth, registrarAuthDeshabilitada } from './auth/rutas.js';
import { registrarRutasJwt } from './auth/rutas-jwt.js';
import type { ProveedorIdentidad } from './auth/proveedor.js';
import type { ProveedorRoles } from './auth/roles.js';
import type { AlmacenSesiones } from './auth/sesiones.js';
import { authHabilitada, cookiesSeguras, type Config } from './config.js';
import { registrarGateway } from './gateway/rutas.js';
import { ModulosDesplegados } from './gateway/despliegues.js';
import type { MapaModulos } from './gateway/modulos.js';
import { enviarProblema } from './http/problema.js';
import type { ModuloRegistry } from './registry/registry.js';
import { registrarShell } from './shell/rutas.js';
import { registrarRutasSistema, type ChequeoListo } from './sistema/rutas.js';

const HEADER_CORRELACION = 'x-correlation-id';
const FORMATO_CORRELACION = /^[A-Za-z0-9._-]{8,128}$/;

export interface OpcionesApp {
  config: Config;
  chequeos?: ChequeoListo[];
  /** Dependencias del login. Si faltan o la config no lo habilita, /auth/* responde 503. */
  auth?: { proveedor: ProveedorIdentidad; sesiones: AlmacenSesiones };
  /** Emisor del JWT de plataforma: publica /.well-known/jwks.json. */
  emisor?: EmisorJwt;
  /** Roles de los usuarios (o una fábrica que recibe el logger). Sin proveedor, nadie tiene roles. */
  roles?: ProveedorRoles | ((log: FastifyBaseLogger) => ProveedorRoles);
  /** Módulos montados en /m/<id> (requiere emisor). Con el mapa del deployer, el gateway queda siempre activo. */
  modulos?: MapaModulos;
  /** Registry de módulos y carpeta del build del Shell. Sin registry no se publica el Shell. */
  shell?: { registry: ModuloRegistry[]; dir: string };
}

export function construirApp({ config, chequeos = [], auth, emisor, roles: rolesOFabrica, modulos, shell }: OpcionesApp): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
      base: { servicio: 'plataforma-api', version: config.APP_VERSION },
      // E7: nunca loguear credenciales.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    requestIdHeader: false,
    logController: new LogController({ requestIdLogLabel: 'correlationId' }),
    // E7: reutiliza el correlationId recibido (si es válido) o genera uno nuevo.
    genReqId: (req) => {
      const recibido = req.headers[HEADER_CORRELACION];
      return typeof recibido === 'string' && FORMATO_CORRELACION.test(recibido) ? recibido : randomUUID();
    },
  });

  // Un YAML de roles inválido lanza acá y la API no arranca (mejor que entrar sin control).
  const roles = typeof rolesOFabrica === 'function' ? rolesOFabrica(app.log) : rolesOFabrica;

  app.addHook('onSend', async (req, reply) => {
    reply.header(HEADER_CORRELACION, req.id);
    // Cabeceras de seguridad para todo (incluidas las respuestas de módulos vía gateway).
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    reply.header('x-frame-options', 'SAMEORIGIN');
    if (!reply.hasHeader('content-security-policy')) reply.header('content-security-policy', "frame-ancestors 'self'");
  });

  // E8: errores en formato Problem Details, sin stack traces hacia el cliente.
  app.setErrorHandler((error, req, reply) => {
    const codigo = (error as { statusCode?: unknown }).statusCode;
    const status = typeof codigo === 'number' && codigo >= 400 && codigo < 600 ? codigo : 500;
    if (status >= 500) req.log.error({ err: error }, 'error no controlado');
    const mensaje = error instanceof Error ? error.message : 'Solicitud inválida';
    return reply
      .code(status)
      .type('application/problem+json')
      .send({
        type: 'about:blank',
        title: status >= 500 ? 'Error interno' : mensaje,
        status,
        correlationId: req.id,
      });
  });

  app.setNotFoundHandler((req, reply) => enviarProblema(req, reply, 404, 'No encontrado'));

  if (auth && authHabilitada(config) && config.SESSION_SECRET) {
    app.register(cookie, { secret: config.SESSION_SECRET });
    app.after(() =>
      registrarRutasAuth(app, {
        ...auth,
        ...(roles ? { roles } : {}),
        urlPublica: config.PLATFORM_URL_PUBLICA,
        ttlSesionMin: config.SESSION_TTL_MIN,
        cookiesSeguras: cookiesSeguras(config),
        dominioRequerido: config.OIDC_DOMINIO_REQUERIDO,
      }),
    );
  } else {
    registrarAuthDeshabilitada(app);
  }

  if (emisor) app.after(() => registrarRutasJwt(app, { emisor, diagnostico: config.ENTORNO === 'local', ...(roles ? { roles } : {}) }));

  if (shell) {
    app.register(async (scope) =>
      registrarShell(scope, { registry: shell.registry, modulos: modulos ?? new Map(), roles, dirShell: shell.dir }),
    );
  }

  if (emisor && modulos && (modulos instanceof ModulosDesplegados || modulos.size > 0)) {
    app.register(async (scope) =>
      registrarGateway(scope, { modulos, emisor, roles, timeoutMs: config.GATEWAY_TIMEOUT_MS }),
    );
  }

  registrarRutasSistema(app, config, chequeos);
  return app;
}
