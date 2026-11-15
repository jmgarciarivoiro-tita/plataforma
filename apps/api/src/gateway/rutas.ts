// I1-4: gateway /m/<id>. Verifica la sesión, controla el acceso al módulo, emite el JWT con los
// roles del módulo y reenvía la request. El módulo nunca ve la cookie de sesión (E2, ADR-007).
import replyFrom from '@fastify/reply-from';
import { audienciaModulo } from '@plataforma/auth';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { EmisorJwt } from '../auth/emisor.js';
import { rolesParaAudiencia, SIN_ROLES, type ProveedorRoles } from '../auth/roles.js';
import { enviarProblema } from '../http/problema.js';
import type { MapaModulos } from './modulos.js';

export interface OpcionesGateway {
  modulos: MapaModulos;
  emisor: EmisorJwt;
  roles?: ProveedorRoles | undefined;
  timeoutMs?: number;
}

// Headers que nunca llegan al módulo: credenciales del navegador y cualquier token que mande el cliente.
const HEADERS_QUITADOS = ['cookie', 'authorization', 'x-forwarded-user', 'x-platform-user'];

export async function registrarGateway(app: FastifyInstance, o: OpcionesGateway): Promise<void> {
  await app.register(async (scope) => {
    // El cuerpo se reenvía como stream, sin parsear (permite JSON, formularios y archivos).
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', (_req, payload, done) => done(null, payload));
    await scope.register(replyFrom, { disableRequestLogging: true, retryMethods: [] });

    const manejar = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = req.params;
      const destino = o.modulos.get(id);
      if (!destino) return enviarProblema(req, reply, 404, 'Módulo inexistente');

      // Evita salir del prefijo del módulo con ../ (también codificado).
      const ruta = req.url.split('?')[0] ?? '';
      if (/(^|\/)(\.|%2e){2}(\/|$)/i.test(ruta) || /%2f|%5c|\\/i.test(ruta)) {
        return enviarProblema(req, reply, 400, 'Ruta inválida');
      }

      if (!req.usuario) {
        const quiereHtml = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
        if (quiereHtml) return reply.redirect(`/auth/login?returnTo=${encodeURIComponent(req.url)}`, 302);
        return enviarProblema(req, reply, 401, 'No autenticado');
      }

      const audiencia = audienciaModulo(id);
      const r = o.roles ? await o.roles.obtenerRoles(req.usuario) : SIN_ROLES;
      const rolesModulo = rolesParaAudiencia(r, audiencia);
      if (rolesModulo.length === 0) {
        req.log.info({ sub: req.usuario.sub, modulo: id }, 'acceso denegado: sin roles en el módulo');
        return enviarProblema(req, reply, 403, 'No tenés acceso a este módulo');
      }

      const token = await o.emisor.emitir({ usuario: req.usuario, audiencia, roles: rolesModulo, empresas: r.empresas });

      return reply.from(new URL(req.url, destino).toString(), {
        timeout: o.timeoutMs ?? 30_000,
        rewriteRequestHeaders: (request, headers) => {
          const h = Object.fromEntries(Object.entries(headers).filter(([k]) => !HEADERS_QUITADOS.includes(k)));
          return {
            ...h,
            authorization: `Bearer ${token}`,
            'x-correlation-id': request.id,
            'x-forwarded-prefix': `/m/${id}`,
          };
        },
        // Un módulo no puede fijar cookies en el dominio de la plataforma.
        rewriteHeaders: (headers) => {
          const h = { ...headers };
          delete h['set-cookie'];
          return h;
        },
        onError: (rep, { error }) => {
          req.log.error({ err: error.message, modulo: id }, 'módulo no disponible');
          void enviarProblema(req, rep as FastifyReply, 502, 'El módulo no está disponible');
        },
      });
    };

    scope.all('/m/:id', manejar);
    scope.all('/m/:id/*', manejar);
  });
}
