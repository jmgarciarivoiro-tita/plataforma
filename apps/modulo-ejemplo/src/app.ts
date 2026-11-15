// Módulo de referencia (contrato E1–E4): todo bajo /m/<id>, JWT de plataforma obligatorio y rol
// mínimo por endpoint. Sirve para probar el gateway; la plantilla de módulos (I2) parte de acá.
import { tieneRol, tokenDeHeader, TokenInvalidoError, type ClaimsPlataforma, type Verificador } from '@plataforma/auth';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    claims: ClaimsPlataforma | null;
  }
}

export interface OpcionesModulo {
  id: string;
  verificar: Verificador;
  logger?: boolean;
}

function problema(req: FastifyRequest, reply: FastifyReply, status: number, title: string) {
  return reply.code(status).type('application/problem+json').send({ type: 'about:blank', title, status, correlationId: req.id });
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function construirModulo(o: OpcionesModulo): FastifyInstance {
  const base = `/m/${o.id}`;
  const app = Fastify({
    logger: o.logger ?? false,
    requestIdHeader: 'x-correlation-id',
  });

  // E4: endpoints de sistema sin autenticación (solo red interna).
  app.get('/health', async () => ({ estado: 'ok' }));
  app.get('/ready', async () => ({ estado: 'listo' }));
  app.get('/meta', async () => ({ id: o.id, version: '0.1.0' }));

  // E2: todo lo que está bajo /m/<id> exige un JWT de plataforma válido para este módulo.
  app.decorateRequest('claims', null);
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith(base)) return;
    const token = tokenDeHeader(req.headers.authorization);
    if (!token) return problema(req, reply, 401, 'Falta el token de plataforma');
    try {
      req.claims = await o.verificar(token);
    } catch (err) {
      req.log.warn({ err: err instanceof TokenInvalidoError ? err.message : 'error' }, 'token rechazado');
      return problema(req, reply, 401, 'Token de plataforma inválido');
    }
  });

  // E3: cada endpoint declara su rol mínimo.
  const exigir = (rol: string) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.claims || !tieneRol(req.claims, rol)) return problema(req, reply, 403, `Requiere el rol ${rol}`);
  };

  app.get(`${base}/api/v1/yo`, async (req) => req.claims);

  app.post(`${base}/api/v1/registros`, { preHandler: exigir('operador') }, async (req, reply) =>
    reply.code(201).send({ creadoPor: req.claims?.sub, cuerpo: req.body ?? null }),
  );

  app.delete(`${base}/api/v1/registros/:n`, { preHandler: exigir('administrador') }, async (_req, reply) =>
    reply.code(204).send(),
  );

  app.get(`${base}`, async (req, reply) => reply.redirect(`${base}/`, 301));
  app.get(`${base}/`, async (req, reply) => {
    const c = req.claims;
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Módulo de ejemplo</title>
<style>body{font-family:system-ui;margin:2rem;max-width:48rem}code,pre{background:#f4f4f4;padding:.2rem .4rem;border-radius:4px}</style></head>
<body><h1>Módulo de ejemplo</h1>
<p>Llegaste por el gateway. El módulo verificó el JWT de plataforma con <code>@plataforma/auth</code>.</p>
<ul><li>Usuario: <strong>${escapar(c?.nombre ?? c?.sub ?? '')}</strong></li>
<li>Roles en este módulo: <strong>${escapar((c?.roles ?? []).join(', ') || '—')}</strong></li>
<li>Empresas: <strong>${escapar((c?.empresas ?? []).join(', ') || '—')}</strong></li>
<li>Correlation ID: <code>${escapar(req.id)}</code></li></ul>
<pre>${escapar(JSON.stringify(c, null, 2))}</pre></body></html>`;
  });

  return app;
}
