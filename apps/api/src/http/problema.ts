// E8: respuestas de error en formato Problem Details (RFC 9457).
import type { FastifyReply, FastifyRequest } from 'fastify';

export function enviarProblema(req: FastifyRequest, reply: FastifyReply, status: number, titulo: string): FastifyReply {
  return reply.code(status).type('application/problem+json').send({
    type: 'about:blank',
    title: titulo,
    status,
    correlationId: req.id,
  });
}
