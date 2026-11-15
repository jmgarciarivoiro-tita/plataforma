// Operaciones git con el token de la App. El token va por variables de entorno de git
// (GIT_CONFIG_*), nunca en la URL ni en los argumentos del proceso.
import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ModuloRegistry } from '@plataforma/contracts';
import { adaptarPlantilla } from './contenido.js';
import { RAMA_INICIAL } from './deseado.js';
import type { OperacionesGit } from './reconciliar.js';

const exec = promisify(execFile);

export interface OpcionesGit {
  org: string;
  token: string;
  repoPlantilla: string;
  autorNombre: string;
  autorEmail: string;
  /** Solo para tests: base de las URLs de los repos (por defecto https://github.com). */
  baseGit?: string;
}

export function crearOperacionesGit(o: OpcionesGit): OperacionesGit {
  const basic = Buffer.from(`x-access-token:${o.token}`).toString('base64');
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    // Los archivos se copian byte a byte, sin importar la configuración de git de la máquina.
    GIT_CONFIG_KEY_1: 'core.autocrlf',
    GIT_CONFIG_VALUE_1: 'false',
    GIT_AUTHOR_NAME: o.autorNombre,
    GIT_AUTHOR_EMAIL: o.autorEmail,
    GIT_COMMITTER_NAME: o.autorNombre,
    GIT_COMMITTER_EMAIL: o.autorEmail,
  };
  const git = (cwd: string, ...args: string[]) => exec('git', args, { cwd, env });
  const url = (repo: string) => `${o.baseGit ?? 'https://github.com'}/${o.org}/${repo}.git`;
  const temporal = () => mkdtempSync(join(tmpdir(), 'aprov-'));

  return {
    async inicializarMain(repo) {
      const dir = temporal();
      try {
        await git(dir, 'init', '-q', '-b', 'main');
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'chore: inicio del repo (aprovisionamiento)');
        await git(dir, 'push', '-q', url(repo), 'main');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },

    async publicarContenido(repo, m: ModuloRegistry, tag) {
      const dir = temporal();
      try {
        const destino = join(dir, 'destino');
        const plantilla = join(dir, 'plantilla');
        await git(dir, 'clone', '-q', url(repo), destino);
        await git(dir, 'clone', '-q', '--depth', '1', '--branch', tag, url(o.repoPlantilla), plantilla);
        for (const f of readdirSync(plantilla)) {
          if (f !== '.git') cpSync(join(plantilla, f), join(destino, f), { recursive: true });
        }
        adaptarPlantilla(destino, m);
        await git(destino, 'switch', '-q', '-c', RAMA_INICIAL);
        await git(destino, 'add', '-A');
        await git(destino, 'commit', '-q', '-m', `chore: contenido inicial desde ${m.plantilla}`);
        await git(destino, 'push', '-q', 'origin', RAMA_INICIAL);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
