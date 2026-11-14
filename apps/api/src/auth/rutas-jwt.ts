// JWKS público y, solo en ENTORNO=local, un endpoint de diagnóstico para ver el token emitido.
import { AUDIENCIA_PLATAFORMA, audienciaModulo } from '@plataforma/auth';
import type { FastifyInstance } from 'fastify';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import { enviarProblema } from '../http/problema.js';
import type { EmisorJwt } from './emisor.js';

const consultaDiagnostico = z.object({
  aud: z
    .string()
    .regex(/^(plataforma|modulo:[a-z][a-z0-9-]{2,40})$/)
    .default(AUDIENCIA_PLATAFORMA),
});

export function registrarRutasJwt(app: FastifyInstance, o: { emisor: EmisorJwt; diagnostico: boolean }): void {
  app.get('/.well-known/jwks.json', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return o.emisor.jwks();
  });

  if (!o.diagnostico) return;

  // Solo local: permite ver qué emitiría el gateway para el usuario logueado. Nunca en staging/producción.
  app.get('/auth/token-diagnostico', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!req.usuario) return enviarProblema(req, reply, 401, 'No autenticado');
    const consulta = consultaDiagnostico.safeParse(req.query);
    if (!consulta.success) return enviarProblema(req, reply, 400, 'Audiencia inválida');
    const aud = consulta.data.aud.startsWith('modulo:')
      ? audienciaModulo(consulta.data.aud.slice('modulo:'.length))
      : AUDIENCIA_PLATAFORMA;
    // Roles y empresas vacíos hasta I1-3 (ProveedorRoles).
    const token = await o.emisor.emitir({ usuario: req.usuario, audiencia: aud, roles: [], empresas: [] });
    return { claims: decodeJwt(token), token };
  });
}
