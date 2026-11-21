// I4-3: un pedido de producción solo se ejecuta si GitHub registra la aprobación humana que exige el
// riesgo del módulo, quien aprobó no es quien pidió y el mismo digest ya estuvo sano en staging.
// No se confía en el pedido: todo se vuelve a consultar por API (ADR 0014).
import type { ModuloRegistry } from '@plataforma/contracts';
import type { ClienteGitHub } from '@plataforma/github';
import { leerPayload, TAREA } from './verificacion.js';

export interface Promocion {
  solicitante: string;
  aprobadores: string[];
  run: number;
}

interface RunApi {
  event: string;
  head_branch: string | null;
  status: string;
  conclusion: string | null;
  actor: { login: string } | null;
  triggering_actor: { login: string } | null;
  referenced_workflows?: { path: string }[];
}

interface AprobacionApi {
  state: string;
  user: { login: string } | null;
  environments: { name: string }[];
}

interface JobApi {
  name: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Nombre del job de modulo-promover.yml que crea el pedido (sufijo: el llamador antepone su propio job). */
export const JOB_PEDIDO = 'producción (pedido de despliegue)';

interface DeploymentApi {
  id: number;
  payload: unknown;
}

/** Environments que tienen que estar aprobados según el riesgo (docs/07, ADR 0008). */
export function environmentsRequeridos(riesgo: ModuloRegistry['riesgo']): string[] {
  return riesgo === 'bajo' ? ['production'] : ['aceptacion-negocio', 'production'];
}

export async function verificarPromocion(
  o: { gh: ClienteGitHub; org: string; modulo: ModuloRegistry; pedido: number; creado: string; digest: string; run: number },
): Promise<Promocion> {
  const base = `/repos/${o.org}/${o.modulo.repo}`;

  // 1. El run es una promoción del workflow de la plataforma, disparada a mano sobre main.
  const run = await o.gh.pedir<RunApi>('GET', `${base}/actions/runs/${o.run}`);
  const promover = new RegExp(`^${o.org}/plataforma/\\.github/workflows/modulo-promover\\.yml(@|$)`, 'i');
  if (!(run.referenced_workflows ?? []).some((w) => promover.test(w.path))) {
    throw new Error(`el run ${o.run} no usa modulo-promover.yml de la plataforma`);
  }
  if (run.event !== 'workflow_dispatch' || run.head_branch !== 'main') throw new Error(`el run ${o.run} no es una promoción manual desde main`);
  if (run.status === 'completed' && run.conclusion !== 'success') throw new Error(`el run ${o.run} terminó en ${run.conclusion ?? 'error'}`);
  const solicitante = run.triggering_actor?.login ?? run.actor?.login ?? '';
  if (!solicitante) throw new Error(`el run ${o.run} no informa quién lo disparó`);

  // 2. Aprobaciones registradas por GitHub en el run: una por environment requerido, de otra persona.
  const revisiones = await o.gh.pedir<AprobacionApi[]>('GET', `${base}/actions/runs/${o.run}/approvals`);
  if (revisiones.some((r) => r.state === 'rejected')) throw new Error(`la promoción del run ${o.run} fue rechazada`);
  const aprobadores = new Set<string>();
  for (const env of environmentsRequeridos(o.modulo.riesgo)) {
    const deEse = revisiones.filter((r) => r.state === 'approved' && r.environments.some((e) => e.name === env)).map((r) => r.user?.login ?? '');
    if (deEse.length === 0) throw new Error(`falta la aprobación de "${env}" en el run ${o.run}`);
    const independientes = deEse.filter((u) => u && u !== solicitante && u !== run.actor?.login);
    if (independientes.length === 0) throw new Error(`"${env}" lo aprobó quien pidió la promoción (${solicitante})`);
    independientes.forEach((u) => aprobadores.add(u));
  }

  // 3. El pedido lo creó el job aprobado de ESE run: se creó mientras el job corría. Otro workflow del
  //    repo que copie el run_id fuera de esa ventana queda afuera.
  const { jobs } = await o.gh.pedir<{ jobs: JobApi[] }>('GET', `${base}/actions/runs/${o.run}/jobs?per_page=50`);
  const job = jobs.find((j) => j.name.endsWith(JOB_PEDIDO));
  const creado = Date.parse(o.creado);
  const dentro = job?.started_at && creado >= Date.parse(job.started_at) && (!job.completed_at || creado <= Date.parse(job.completed_at));
  if (!dentro) throw new Error(`el pedido no lo creó el job de producción del run ${o.run}`);

  // 4. Cada run promueve una sola vez: si ya hubo un despliegue exitoso con ese run, se rechaza.
  const produccion = await o.gh.pedir<DeploymentApi[]>('GET', `${base}/deployments?environment=production&task=${TAREA}&per_page=30`);
  for (const d of produccion.filter((x) => x.id !== o.pedido && leerPayload(x.payload).run_id === o.run)) {
    const estados = await o.gh.pedir<{ state: string }[]>('GET', `${base}/deployments/${d.id}/statuses?per_page=20`);
    if (estados.some((e) => e.state === 'success')) throw new Error(`el run ${o.run} ya se usó en el pedido #${d.id}`);
  }

  // 5. El mismo digest tuvo un despliegue exitoso en staging.
  const staging = await o.gh.pedir<DeploymentApi[]>('GET', `${base}/deployments?environment=staging&task=${TAREA}&per_page=30`);
  let probado = false;
  for (const d of staging.filter((x) => leerPayload(x.payload).digest === o.digest)) {
    const estados = await o.gh.pedir<{ state: string }[]>('GET', `${base}/deployments/${d.id}/statuses?per_page=20`);
    if (estados.some((e) => e.state === 'success')) {
      probado = true;
      break;
    }
  }
  if (!probado) throw new Error(`el digest ${o.digest.slice(0, 19)} no tiene un despliegue exitoso en staging`);

  return { solicitante, aprobadores: [...aprobadores], run: o.run };
}
