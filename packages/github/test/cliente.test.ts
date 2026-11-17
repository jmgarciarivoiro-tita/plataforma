import { describe, expect, it } from 'vitest';
import { crearClienteGitHub, ErrorGitHub } from '../src/index.js';

function fetchFalso(status: number, cuerpo: string, vistos: { url: string; init: RequestInit }[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    vistos.push({ url, init });
    return new Response(cuerpo || null, { status });
  }) as unknown as typeof fetch;
}

describe('cliente GitHub', () => {
  it('envía el token, la versión de la API y el cuerpo JSON', async () => {
    const vistos: { url: string; init: RequestInit }[] = [];
    const gh = crearClienteGitHub({ token: 'tok', fetchFn: fetchFalso(200, '{"a":1}', vistos) });
    expect(await gh.pedir('POST', '/orgs/o/repos', { name: 'x' })).toEqual({ a: 1 });
    const h = vistos[0]?.init.headers as Record<string, string>;
    expect(vistos[0]?.url).toBe('https://api.github.com/orgs/o/repos');
    expect(h.authorization).toBe('Bearer tok');
    expect(h['x-github-api-version']).toBe('2022-11-28');
    expect(vistos[0]?.init.body).toBe('{"name":"x"}');
  });

  it('acepta una función que da el token (se pide en cada llamada)', async () => {
    const vistos: { url: string; init: RequestInit }[] = [];
    let n = 0;
    const gh = crearClienteGitHub({ token: async () => `t${++n}`, fetchFn: fetchFalso(200, '{}', vistos) });
    await gh.pedir('GET', '/a');
    await gh.pedir('DELETE', '/b');
    expect(vistos.map((v) => (v.init.headers as Record<string, string>).authorization)).toEqual(['Bearer t1', 'Bearer t2']);
    expect(vistos[1]?.init.method).toBe('DELETE');
  });

  it('respuesta vacía (204) → null', async () => {
    const gh = crearClienteGitHub({ token: 't', fetchFn: fetchFalso(204, '') });
    expect(await gh.pedir('PUT', '/repos/o/r/vulnerability-alerts')).toBeNull();
  });

  it('errores con el mensaje de GitHub, sin el token', async () => {
    const gh = crearClienteGitHub({ token: 'secreto', fetchFn: fetchFalso(403, '{"message":"Resource not accessible by integration"}') });
    const err = await gh.pedir('GET', '/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorGitHub);
    expect((err as Error).message).toBe('GET /x → 403: Resource not accessible by integration');
    expect((err as Error).message).not.toContain('secreto');
    const texto = crearClienteGitHub({ token: 't', fetchFn: fetchFalso(502, 'Bad gateway') });
    await expect(texto.pedir('GET', '/x')).rejects.toThrow('502: Bad gateway');
  });

  it('buscar: 404 → null; otros errores se propagan', async () => {
    expect(await crearClienteGitHub({ token: 't', fetchFn: fetchFalso(404, '{"message":"Not Found"}') }).buscar('/r')).toBeNull();
    await expect(crearClienteGitHub({ token: 't', fetchFn: fetchFalso(500, '{}') }).buscar('/r')).rejects.toThrow('500');
  });

  it('rechaza rutas que no son de la API', async () => {
    const gh = crearClienteGitHub({ token: 't', fetchFn: fetchFalso(200, '{}') });
    await expect(gh.pedir('GET', 'https://evil.test/x')).rejects.toThrow('ruta inválida');
    await expect(gh.pedir('GET', '/repos/o/../../x')).rejects.toThrow('ruta inválida');
  });
});
