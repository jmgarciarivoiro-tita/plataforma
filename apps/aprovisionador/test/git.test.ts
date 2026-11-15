// Prueba real con git: repos "remotos" locales (bare) en lugar de github.com.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeownersInicial, crearOperacionesGit } from '../src/git.js';
import { modulo } from './modulo.js';

let raiz: string;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'aprov-test-'));
  mkdirSync(join(raiz, 'org'));
  // Plantilla mínima con tag v0.1.0.
  const p = join(raiz, 'trabajo-plantilla');
  mkdirSync(join(p, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(p, 'package.json'), '{\n  "name": "plantilla-modulo",\n  "version": "0.1.0"\n}\n');
  writeFileSync(join(p, 'modulo.yaml'), 'id: plantilla-modulo\nversion: 0.1.0\n');
  writeFileSync(join(p, 'README.md'), '# plantilla-modulo\n\nTexto.\n');
  writeFileSync(join(p, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
  git(raiz, 'init', '-q', '-b', 'main', p);
  git(p, 'add', '-A');
  git(p, 'commit', '-q', '-m', 'plantilla');
  git(p, 'tag', 'v0.1.0');
  git(raiz, 'clone', '-q', '--bare', p, join(raiz, 'org', 'plantilla-modulo.git'));
  // Repo del módulo recién creado (vacío).
  git(raiz, 'init', '-q', '--bare', '-b', 'main', join(raiz, 'org', 'modulo-notas.git'));
});

afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('operaciones git', () => {
  it('inicializa main vacía y publica la plantilla adaptada en la rama inicial, con el autor del bot', async () => {
    const ops = crearOperacionesGit({ org: 'org', token: 'tok', repoPlantilla: 'plantilla-modulo', teamRevisores: 'sistemas', autorNombre: 'bot[bot]', autorEmail: '1+bot[bot]@users.noreply.github.com', baseGit: `file://${raiz}` });
    const remoto = join(raiz, 'org', 'modulo-notas.git');

    await ops.inicializarMain('modulo-notas');
    expect(git(remoto, 'log', '--format=%s|%an', 'main')).toBe('chore: inicio del repo con CODEOWNERS (aprovisionamiento)|bot[bot]');
    expect(git(remoto, 'ls-tree', '-r', '--name-only', 'main')).toBe('.github/CODEOWNERS');
    expect(git(remoto, 'show', 'main:.github/CODEOWNERS')).toContain('*  @org/sistemas');

    await ops.publicarContenido('modulo-notas', modulo(), 'v0.1.0');
    expect(git(remoto, 'log', '--format=%s', 'aprovisionamiento/inicial')).toContain('chore: contenido inicial desde plantilla-modulo@0.1.0');
    expect(git(remoto, 'rev-parse', 'main')).toBe(git(remoto, 'rev-parse', 'aprovisionamiento/inicial~1'));

    const copia = join(raiz, 'verificacion');
    git(raiz, 'clone', '-q', '--branch', 'aprovisionamiento/inicial', remoto, copia);
    expect(readFileSync(join(copia, 'modulo.yaml'), 'utf8')).toContain('id: notas');
    expect(readFileSync(join(copia, 'package.json'), 'utf8')).toContain('"name": "modulo-notas"');
    expect(readFileSync(join(copia, 'README.md'), 'utf8')).toMatch(/^# modulo-notas\n\n> \*\*Notas internas\*\*/);
    expect(readFileSync(join(copia, '.github', 'workflows', 'ci.yml'), 'utf8')).toBe('name: ci\n');
  });

  it('tag inexistente → falla sin publicar nada', async () => {
    const ops = crearOperacionesGit({ org: 'org', token: 'tok', repoPlantilla: 'plantilla-modulo', teamRevisores: 'sistemas', autorNombre: 'b', autorEmail: 'b@b', baseGit: `file://${raiz}` });
    await ops.inicializarMain('modulo-notas');
    await expect(ops.publicarContenido('modulo-notas', modulo(), 'v9.9.9')).rejects.toThrow();
    expect(() => git(join(raiz, 'org', 'modulo-notas.git'), 'rev-parse', '--verify', 'aprovisionamiento/inicial')).toThrow();
  });
});

describe('CODEOWNERS inicial', () => {
  it('asigna todo el repo al team de revisores', () => {
    expect(codeownersInicial('mi-org', 'sistemas')).toMatch(/^# .*\n\* {2}@mi-org\/sistemas\n$/);
  });
});
