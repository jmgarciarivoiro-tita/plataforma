// Módulo de prueba que cumple todas las políticas; cada test lo rompe de una forma.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ModuloRegistry } from '@plataforma/contracts';

export const CUERPO_PR_OK = '## Qué cambia\n\nAlgo.\n\n## Asistencia de IA (GOB-06)\n\n- Herramienta: claude-code\n- Alcance: parcial\n';

export function moduloValido(pct = 85): string {
  const dir = mkdtempSync(join(tmpdir(), 'pc-'));
  const archivos: Record<string, string> = {
    'README.md': '# modulo-notas\n',
    'AGENTS.md': '# AGENTS\n',
    'CLAUDE.md': '@AGENTS.md\n',
    'modulo.yaml': 'id: notas\nversion: 0.1.0\nroles:\n  - id: lector\n    descripcion: Lee.\n',
    Dockerfile: 'FROM node:26-alpine\n',
    '.github/CODEOWNERS': '* @org/sistemas\n',
    'docs/funcional/README.md': '# Funcional\n',
    'docs/permisos.md': '# Permisos\n',
    'docs/runbook.md': '# Runbook\n',
    'tests/contract/modulo.test.ts': 'test\n',
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    '.npmrc': 'engine-strict=true\n',
    'package.json': JSON.stringify({ name: 'modulo-notas', packageManager: 'pnpm@12.18.0', dependencies: { fastify: '5.12.8' }, devDependencies: { vitest: '5.1.0' } }, null, 2),
    'coverage/coverage-summary.json': JSON.stringify({ total: { lines: { pct } } }),
  };
  for (const [f, c] of Object.entries(archivos)) escribir(dir, f, c);
  return dir;
}

export function escribir(dir: string, f: string, c: string) {
  mkdirSync(dirname(join(dir, f)), { recursive: true });
  writeFileSync(join(dir, f), c);
}

export function registro(extra: Partial<ModuloRegistry> = {}): ModuloRegistry {
  return {
    id: 'notas',
    nombre: 'Notas',
    objetivo: 'Prueba.',
    area: 'Sistemas',
    empresas: ['acopio'],
    duenos: { product_owner: 'po', responsable_tecnico: 'rt' },
    repo: 'modulo-notas',
    plantilla: 'plantilla-modulo@0.1.0',
    estado: 'en_desarrollo',
    riesgo: 'bajo',
    criticidad: 'baja',
    sox: { en_alcance: false, justificacion: 'Prueba.' },
    datos: { clasificacion: 'interna', datos_personales: false },
    agente: { habilitado: false },
    menu: { seccion: 'Sistemas', orden: 1 },
    ...extra,
  };
}
