// Construcción de la app Fastify, separada del arranque para poder testearla con inject().
import { randomUUID } from 'node:crypto';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { registrarRutasSistema, type ChequeoListo } from './sistema/rutas.js';

const HEADER_CORRELACION = 'x-correlation-id';
const FORMATO_CORRELACION = /^[A-Za-z0-9._-]{8,128}$/;

export interface OpcionesApp {
  config: Config;
  chequeos?: ChequeoListo[];
}

export function construirApp({ config, chequeos = [] }: OpcionesApp): FastifyInstance {
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

  app.addHook('onSend', async (req, reply) => {
    reply.header(HEADER_CORRELACION, req.id);
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

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).type('application/problem+json').send({
      type: 'about:blank',
      title: 'No encontrado',
      status: 404,
      correlationId: req.id,
    }),
  );

  registrarRutasSistema(app, config, chequeos);
  return app;
}
