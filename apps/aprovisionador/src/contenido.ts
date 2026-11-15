// Adapta una copia de la plantilla al módulo. Cada reemplazo tiene que aplicarse exactamente una vez:
// si la plantilla cambió y un reemplazo ya no encaja, falla en vez de generar un repo a medias.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuloRegistry } from '@plataforma/contracts';

interface Reemplazo {
  archivo: string;
  buscar: RegExp;
  reemplazo: string;
}

export function reemplazosPara(m: ModuloRegistry): Reemplazo[] {
  return [
    { archivo: 'package.json', buscar: /^ {2}"name": "plantilla-modulo",$/m, reemplazo: `  "name": "${m.repo}",` },
    { archivo: 'modulo.yaml', buscar: /^id: plantilla-modulo$/m, reemplazo: `id: ${m.id}` },
    {
      archivo: 'README.md',
      buscar: /^# plantilla-modulo$/m,
      reemplazo: `# ${m.repo}\n\n> **${m.nombre}** — ${m.objetivo}\n> Generado desde \`${m.plantilla}\` por el aprovisionamiento de la plataforma.`,
    },
  ];
}

export function adaptarPlantilla(dir: string, m: ModuloRegistry): string[] {
  const cambiados: string[] = [];
  for (const r of reemplazosPara(m)) {
    const ruta = join(dir, r.archivo);
    const original = readFileSync(ruta, 'utf8');
    const global = new RegExp(r.buscar.source, `${r.buscar.flags}g`);
    const apariciones = original.match(global)?.length ?? 0;
    if (apariciones !== 1) throw new Error(`${r.archivo}: se esperaba 1 coincidencia de ${r.buscar} y hay ${apariciones}`);
    writeFileSync(ruta, original.replace(r.buscar, r.reemplazo));
    cambiados.push(r.archivo);
  }
  return cambiados;
}
