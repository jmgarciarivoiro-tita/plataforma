// Mapa de despliegues: id del módulo → URL local y digest. Lo escribe el deployer y lo lee el gateway
// (I4-2b). Escritura atómica: archivo temporal + rename, así el gateway nunca lee un JSON a medias.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EntradaMapa, Mapa } from './tipos.js';

export function crearMapa(ruta: string): Mapa {
  const leer = async (): Promise<Record<string, EntradaMapa>> => {
    try {
      return (JSON.parse(await readFile(ruta, 'utf8')) as { modulos?: Record<string, EntradaMapa> }).modulos ?? {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  };
  return {
    leer,
    async escribir(id, entrada) {
      const modulos = { ...(await leer()), [id]: entrada };
      await mkdir(dirname(ruta), { recursive: true });
      const tmp = `${ruta}.tmp`;
      await writeFile(tmp, `${JSON.stringify({ modulos }, null, 2)}\n`);
      await rename(tmp, ruta);
    },
  };
}
