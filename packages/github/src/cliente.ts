// Cliente mínimo de la API REST de GitHub (sin dependencias). El token nunca se loguea.
export class ErrorGitHub extends Error {
  override readonly name = 'ErrorGitHub';
  constructor(
    readonly status: number,
    readonly metodo: string,
    readonly ruta: string,
    detalle: string,
  ) {
    super(`${metodo} ${ruta} → ${status}: ${detalle}`);
  }
}

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ClienteGitHub {
  /** Lanza ErrorGitHub si la respuesta no es 2xx. */
  pedir<T = unknown>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T>;
  /** GET que devuelve null si el recurso no existe (404). */
  buscar<T = unknown>(ruta: string): Promise<T | null>;
}

export interface OpcionesCliente {
  /** Token fijo o función que lo obtiene (por ejemplo, el token de instalación de una App). */
  token: string | (() => Promise<string>);
  api?: string;
  fetchFn?: typeof fetch;
}

export function crearClienteGitHub(o: OpcionesCliente): ClienteGitHub {
  const api = o.api ?? 'https://api.github.com';
  const f = o.fetchFn ?? fetch;

  const pedir = async <T>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> => {
    if (!ruta.startsWith('/') || ruta.includes('..')) throw new Error(`ruta inválida: ${ruta}`);
    const res = await f(`${api}${ruta}`, {
      method: metodo,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${typeof o.token === 'string' ? o.token : await o.token()}`,
        'x-github-api-version': '2022-11-28',
        ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    const texto = await res.text();
    if (!res.ok) {
      let detalle = texto.slice(0, 300);
      try {
        detalle = (JSON.parse(texto) as { message?: string }).message ?? detalle;
      } catch {
        // respuesta sin JSON: se usa el texto recortado
      }
      throw new ErrorGitHub(res.status, metodo, ruta, detalle);
    }
    return (texto ? JSON.parse(texto) : null) as T;
  };

  return {
    pedir,
    async buscar<T>(ruta: string) {
      try {
        return await pedir<T>('GET', ruta);
      } catch (err) {
        if (err instanceof ErrorGitHub && err.status === 404) return null;
        throw err;
      }
    },
  };
}
