// Formatos de salida: markdown (job summary), anotaciones de GitHub y JSON para la IA (resumen-ci.json).
import type { ResultadoEvaluacion } from './evaluar.js';

const ICONO = { ok: '✅', falla: '❌', exceptuada: '⚠️', no_aplica: '➖' } as const;

export function markdown(r: ResultadoEvaluacion): string {
  const filas = r.politicas.map((p) => {
    const detalle = p.estado === 'exceptuada' ? `Excepción ${p.excepcion ?? ''}` : p.fallas.map((f) => f.mensaje).join('<br>');
    return `| ${ICONO[p.estado]} | ${p.id} | ${p.tipo} | ${p.descripcion} | ${detalle.replaceAll('|', '\\|')} |`;
  });
  const veredicto = r.bloquea ? '**❌ Bloquea el merge:** hay políticas exigibles sin cumplir.' : '**✅ Políticas exigibles cumplidas.**';
  return [`## policy-check · \`${r.modulo}\` (riesgo ${r.perfil})`, '', veredicto, '', '| | Política | Tipo | Qué exige | Detalle |', '|---|---|---|---|---|', ...filas].join('\n');
}

const escapar = (s: string) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/** Anotaciones de GitHub Actions: aparecen sobre el archivo y la línea en el PR. */
export function anotaciones(r: ResultadoEvaluacion): string[] {
  return r.politicas.flatMap((p) =>
    p.estado === 'falla' || p.estado === 'exceptuada'
      ? p.fallas.map((f) => {
          const nivel = p.estado === 'falla' && p.tipo === 'E' ? 'error' : 'warning';
          const donde = [f.archivo ? `file=${f.archivo}` : '', f.linea ? `line=${f.linea}` : '', `title=${p.id}`].filter(Boolean).join(',');
          return `::${nivel} ${donde}::${escapar(`${f.mensaje}. ${f.sugerencia}`)}`;
        })
      : [],
  );
}

/** Hallazgos para la IA (doc 13 §4): archivo, línea y sugerencia por cada falla. */
export function paraIa(r: ResultadoEvaluacion) {
  return {
    herramienta: 'policy-check',
    modulo: r.modulo,
    perfil: r.perfil,
    bloquea: r.bloquea,
    hallazgos: r.politicas.flatMap((p) =>
      p.fallas.map((f) => ({ politica: p.id, ok: p.estado !== 'falla', mensaje: f.mensaje, archivo: f.archivo, linea: f.linea, sugerencia: f.sugerencia })),
    ),
  };
}
