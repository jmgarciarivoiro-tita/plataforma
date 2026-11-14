// E4: endpoints de sistema. Sin autenticación; solo deben ser accesibles desde la red interna.
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';

/** Verificación de una dependencia para /ready (base de datos, migraciones, etc.). */
export interface ChequeoListo {
  nombre: string;
  verificar: () => Promise<boolean>;
}

export function registrarRutasSistema(app: FastifyInstance, config: Config, chequeos: ChequeoListo[]): void {
  app.get('/health', async () => ({ estado: 'ok' }));

  app.get('/ready', async (_req, reply) => {
    const resultados = await Promise.all(
      chequeos.map(async (c) => {
        try {
          return { nombre: c.nombre, ok: await c.verificar() };
        } catch {
          return { nombre: c.nombre, ok: false };
        }
      }),
    );
    const ok = resultados.every((r) => r.ok);
    return reply.code(ok ? 200 : 503).send({ estado: ok ? 'listo' : 'no_listo', chequeos: resultados });
  });

  app.get('/meta', async () => ({
    id: 'plataforma-api',
    version: config.APP_VERSION,
    commit: config.APP_COMMIT,
    digest: config.APP_DIGEST,
    entorno: config.ENTORNO,
  }));
}
