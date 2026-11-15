import type { Resultado } from './reconciliar.js';

/** Resumen para el log y el "job summary" del workflow (evidencia del aprovisionamiento). */
export function resumenMarkdown(resultados: Resultado[]): string {
  if (resultados.length === 0) return '## Aprovisionamiento\n\nNo hay módulos en el registry.';
  const icono = { ok: '✅', omitido: '⏭️', error: '❌' } as const;
  const filas = resultados.map((r) => {
    const detalle = r.estado === 'error' ? `Error: ${r.error ?? ''}` : r.estado === 'omitido' ? 'Sin repo propio o retirado' : r.acciones.join('; ');
    return `| ${icono[r.estado]} | \`${r.id}\` | \`${r.repo}\` | ${detalle.replaceAll('|', '\\|')} |`;
  });
  return ['## Aprovisionamiento', '', '| | Módulo | Repo | Acciones |', '|---|---|---|---|', ...filas].join('\n');
}
