import type { Salud } from './tipos.js';

/** Espera a que el módulo responda /health y que /meta tenga el id esperado. */
export function crearSalud(o: { intentos?: number; esperaMs?: number; fetchFn?: typeof fetch } = {}): Salud {
  const f = o.fetchFn ?? fetch;
  const intentos = o.intentos ?? 30;
  const esperaMs = o.esperaMs ?? 1000;
  return {
    async esperar(puerto, idModulo) {
      for (let i = 0; i < intentos; i++) {
        try {
          const salud = await f(`http://127.0.0.1:${puerto}/health`, { signal: AbortSignal.timeout(2000) });
          if (salud.ok) {
            const meta = (await (await f(`http://127.0.0.1:${puerto}/meta`, { signal: AbortSignal.timeout(2000) })).json()) as { id?: string };
            return meta.id === idModulo;
          }
        } catch {
          // todavía arrancando
        }
        await new Promise((r) => setTimeout(r, esperaMs));
      }
      return false;
    },
  };
}
