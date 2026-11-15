// Punto de entrada del workflow de aprovisionamiento. Configuración por entorno (P1).
import { appendFileSync } from 'node:fs';
import { cargarRegistry } from '@plataforma/contracts';
import { z } from 'zod';
import { crearOperacionesGit } from './git.js';
import { crearClienteGitHub } from './github.js';
import { reconciliarRegistry } from './reconciliar.js';
import { resumenMarkdown } from './resumen.js';

const env = z
  .object({
    GH_TOKEN: z.string().min(1),
    ORG: z.string().regex(/^[A-Za-z0-9-]+$/),
    TEAM_REVISORES: z.string().regex(/^[a-z0-9-]+$/),
    REPO_PLANTILLA: z.string().regex(/^[a-z0-9-]+$/),
    REGISTRY_DIR: z.string().min(1),
    GIT_AUTOR_NOMBRE: z.string().min(1),
    GIT_AUTOR_EMAIL: z.string().min(3),
    SOLO_MODULO: z.string().optional(),
    GITHUB_STEP_SUMMARY: z.string().optional(),
  })
  .parse(process.env);

const modulos = cargarRegistry(env.REGISTRY_DIR).filter((m) => !env.SOLO_MODULO || m.id === env.SOLO_MODULO);
const resultados = await reconciliarRegistry(modulos, {
  org: env.ORG,
  teamRevisores: env.TEAM_REVISORES,
  repoPlantilla: env.REPO_PLANTILLA,
  gh: crearClienteGitHub({ token: env.GH_TOKEN }),
  git: crearOperacionesGit({ org: env.ORG, token: env.GH_TOKEN, repoPlantilla: env.REPO_PLANTILLA, teamRevisores: env.TEAM_REVISORES, autorNombre: env.GIT_AUTOR_NOMBRE, autorEmail: env.GIT_AUTOR_EMAIL }),
});

const md = resumenMarkdown(resultados);
process.stdout.write(`${md}\n`);
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${md}\n`);
if (resultados.some((r) => r.estado === 'error')) process.exitCode = 1;
