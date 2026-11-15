// Mapa id de módulo → URL interna del contenedor. MVP: variable GATEWAY_MODULOS.
// Más adelante lo completa el deployer a partir del registry (ADR-011, ADR-061).
const ID = /^[a-z][a-z0-9-]{2,40}$/;

export type MapaModulos = ReadonlyMap<string, URL>;

/** Formato: `id=http://host:puerto,id2=http://host2:puerto`. Lanza si algo es inválido. */
export function parsearModulos(texto: string | undefined): MapaModulos {
  const mapa = new Map<string, URL>();
  for (const parte of (texto ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const igual = parte.indexOf('=');
    const id = parte.slice(0, igual).trim();
    const destino = parte.slice(igual + 1).trim();
    if (igual < 1 || !ID.test(id)) throw new Error(`GATEWAY_MODULOS: id inválido en "${parte}"`);
    let url: URL;
    try {
      url = new URL(destino);
    } catch {
      throw new Error(`GATEWAY_MODULOS: URL inválida para ${id}`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.username) {
      throw new Error(`GATEWAY_MODULOS: ${id} debe ser http(s)://host:puerto sin ruta, query ni credenciales`);
    }
    if (mapa.has(id)) throw new Error(`GATEWAY_MODULOS: ${id} repetido`);
    mapa.set(id, url);
  }
  return mapa;
}
