// Verificación de la atestación de procedencia con gh (ADR 0011): la imagen tiene que estar firmada
// por el workflow de publicación de plataforma y construida desde el repo del módulo.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { VerificadorAtestacion } from './tipos.js';

const exec = promisify(execFile);

export function crearVerificadorAtestacion(o: { org: string; workflowFirmante: string; token: () => Promise<string> }): VerificadorAtestacion {
  return {
    async verificar(imagen, digest, repo) {
      const args = ['attestation', 'verify', `oci://${imagen}@${digest}`, '--repo', repo, '--signer-workflow', o.workflowFirmante, '--format', 'json'];
      try {
        await exec('gh', args, { env: { ...process.env, GH_TOKEN: await o.token(), GH_PROMPT_DISABLED: '1' }, maxBuffer: 10 * 1024 * 1024 });
      } catch (err) {
        const salida = `${(err as { stderr?: string }).stderr ?? ''}`.trim().split('\n').slice(-1)[0] ?? '';
        throw new Error(`atestación inválida: ${salida || 'gh attestation verify falló'}`, { cause: err });
      }
    },
  };
}
