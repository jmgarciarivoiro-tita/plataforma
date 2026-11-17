// Docker por CLI. Los contenedores corren sin privilegios: sistema de archivos de solo lectura, sin
// capacidades, sin escalada, memoria y procesos limitados, y el puerto publicado solo en 127.0.0.1.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Contenedor, Docker, Entorno } from './tipos.js';

const exec = promisify(execFile);
const docker = async (...args: string[]) => (await exec('docker', args, { maxBuffer: 10 * 1024 * 1024 })).stdout.trim();

export function crearDocker(): Docker {
  return {
    async descargar(imagen) {
      await docker('pull', '--quiet', imagen);
    },
    async listar(entorno: Entorno) {
      const formato = '{{.Names}}|{{.Label "plataforma.modulo"}}|{{.Label "plataforma.digest"}}|{{.Label "plataforma.puerto"}}';
      const salida = await docker('ps', '-a', '--filter', 'label=plataforma.administrado=si', '--filter', `label=plataforma.entorno=${entorno}`, '--format', formato);
      return salida
        .split('\n')
        .filter(Boolean)
        .map((l): Contenedor => {
          const [nombre = '', modulo = '', digest = '', puerto = '0'] = l.split('|');
          return { nombre, modulo, entorno, digest, puerto: Number(puerto) };
        });
    },
    async ejecutar(o) {
      const args = ['run', '-d', '--name', o.nombre, '--restart', 'unless-stopped'];
      args.push('--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges');
      args.push('--memory', '256m', '--pids-limit', '128', '-p', `127.0.0.1:${o.puerto}:3000`);
      args.push('--add-host', 'host.docker.internal:host-gateway');
      args.push('--label', 'plataforma.administrado=si');
      for (const [k, v] of Object.entries(o.etiquetas)) args.push('--label', `${k}=${v}`);
      for (const [k, v] of Object.entries(o.env)) args.push('-e', `${k}=${v}`);
      args.push(o.imagen);
      await docker(...args);
    },
    async eliminar(nombre) {
      await docker('rm', '-f', nombre);
    },
    async logs(nombre) {
      const { stdout, stderr } = await exec('docker', ['logs', '--tail', '40', nombre]).catch(() => ({ stdout: '', stderr: '' }));
      return `${stdout}${stderr}`;
    },
  };
}
