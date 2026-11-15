// Acceso del Shell a la API de la plataforma (mismo origen, cookie de sesión HttpOnly).

export interface Usuario {
  sub: string;
  email: string | null;
  nombre: string | null;
}

export interface Modulo {
  id: string;
  nombre: string;
  seccion: string;
  url: string;
}

export class NoAutenticadoError extends Error {
  override readonly name = 'NoAutenticadoError';
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function getJson<T>(f: Fetch, url: string): Promise<T> {
  const res = await f(url, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (res.status === 401) throw new NoAutenticadoError();
  if (!res.ok) throw new Error(`Error ${res.status} al consultar ${url}`);
  return (await res.json()) as T;
}

export function crearApi(f: Fetch = (i, init) => fetch(i, init)) {
  return {
    usuario: () => getJson<Usuario>(f, '/auth/me'),
    modulos: async () => (await getJson<{ modulos: Modulo[] }>(f, '/api/v1/shell/modulos')).modulos,
    async cerrarSesion(): Promise<void> {
      await f('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    },
  };
}

export const URL_LOGIN = '/auth/login?returnTo=%2F';
