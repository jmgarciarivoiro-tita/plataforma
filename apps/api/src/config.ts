// P1: toda la configuración llega por variables de entorno y se valida al arrancar.
import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ENTORNO: z.enum(['local', 'staging', 'production']).default('local'),
  // Datos de /meta: los inyecta el pipeline al construir la imagen (P5).
  APP_VERSION: z.string().default('0.0.0-dev'),
  APP_COMMIT: z.string().default('desconocido'),
  APP_DIGEST: z.string().default('desconocido'),
});

export type Config = z.infer<typeof esquema>;

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const detalle = resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  return resultado.data;
}
