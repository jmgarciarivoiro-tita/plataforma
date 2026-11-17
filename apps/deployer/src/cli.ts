// Deployer local del MVP: un proceso por entorno que consulta GitHub cada INTERVALO_SEG.
//   pnpm --filter @plataforma/deployer start   (lee infra/local/deployer.env, fuera de Git)
import { readFileSync } from 'node:fs';
import { cargarRegistry } from '@plataforma/contracts';
import { crearClienteGitHub, crearProveedorTokenApp } from '@plataforma/github';
import { z } from 'zod';
import { crearVerificadorAtestacion } from './atestacion.js';
import { modulosDesplegables, procesarModulo } from './ciclo.js';
import { crearDocker } from './docker.js';
import { crearMapa } from './mapa.js';
import { crearSalud } from './salud.js';

const c = z
  .object({
    ORG: z.string().regex(/^[A-Za-z0-9-]+$/),
    ENTORNO: z.enum(['staging', 'production']),
    DEPLOYER_CLIENT_ID: z.string().min(1),
    DEPLOYER_CLAVE_PATH: z.string().min(1),
    REGISTRY_DIR: z.string().default('../../registry'),
    MAPA_PATH: z.string().min(1),
    PUERTOS: z.string().regex(/^\d+-\d+$/),
    INTERVALO_SEG: z.coerce.number().int().min(10).default(20),
    MODULO_PLATFORM_JWKS_URL: z.url(),
    MODULO_PLATFORM_ISSUER: z.string().min(1),
  })
  .parse(process.env);

// Producción exige verificar la aprobación humana del run y que el digest haya pasado por staging (I4-3).
// Hasta entonces el deployer se niega a arrancar contra producción: un pedido del bot no alcanza.
if (c.ENTORNO === 'production') {
  process.stderr.write('ENTORNO=production todavía no está habilitado: requiere la verificación de aprobaciones de I4-3.\n');
  process.exit(2);
}

const [desde, hasta] = c.PUERTOS.split('-').map(Number) as [number, number];
const token = crearProveedorTokenApp({
  clientId: c.DEPLOYER_CLIENT_ID,
  clavePrivada: readFileSync(c.DEPLOYER_CLAVE_PATH, 'utf8'),
  org: c.ORG,
  permisos: { deployments: 'write', actions: 'read', metadata: 'read' },
});
const log = (m: string) => process.stdout.write(`${new Date().toISOString()} [${c.ENTORNO}] ${m}\n`);
const ctx = {
  org: c.ORG,
  entorno: c.ENTORNO,
  gh: crearClienteGitHub({ token }),
  docker: crearDocker(),
  atestacion: crearVerificadorAtestacion({ org: c.ORG, workflowFirmante: `${c.ORG}/plataforma/.github/workflows/modulo-publicar.yml`, token }),
  salud: crearSalud(),
  mapa: crearMapa(c.MAPA_PATH),
  rangoPuertos: [desde, hasta] as [number, number],
  envModulo: { PLATFORM_JWKS_URL: c.MODULO_PLATFORM_JWKS_URL, PLATFORM_ISSUER: c.MODULO_PLATFORM_ISSUER },
  log,
};

let activo = true;
for (const senal of ['SIGINT', 'SIGTERM'] as const) process.on(senal, () => (activo = false));
log(`deployer iniciado: ${c.ORG}, puertos ${c.PUERTOS}, cada ${c.INTERVALO_SEG} s`);
while (activo) {
  for (const m of modulosDesplegables(cargarRegistry(c.REGISTRY_DIR))) {
    try {
      const r = await procesarModulo(m, ctx);
      if (r.estado !== 'sin_pedidos') log(`${r.modulo}: ${r.estado}${r.detalle ? ` (${r.detalle})` : ''}`);
    } catch (err) {
      log(`${m.id}: no se pudo consultar GitHub (${(err as Error).message})`);
    }
  }
  for (let s = 0; s < c.INTERVALO_SEG && activo; s++) await new Promise((r) => setTimeout(r, 1000));
}
log('deployer detenido');
