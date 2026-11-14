// Punto de entrada: carga configuración, arranca y apaga ordenadamente (E9).
import { construirApp } from './app.js';
import { crearEmisorJwt } from './auth/emisor.js';
import { crearProveedorOidc } from './auth/oidc.js';
import { AlmacenSesionesMemoria } from './auth/sesiones.js';
import { authHabilitada, cargarConfig } from './config.js';

const config = cargarConfig();
const auth =
  authHabilitada(config) && config.OIDC_CLIENT_ID && config.OIDC_CLIENT_SECRET
    ? {
        proveedor: crearProveedorOidc({
          issuer: config.OIDC_ISSUER,
          clientId: config.OIDC_CLIENT_ID,
          clientSecret: config.OIDC_CLIENT_SECRET,
          redirectUri: new URL('/auth/callback', config.PLATFORM_URL_PUBLICA).toString(),
          dominioSugerido: config.OIDC_DOMINIO_REQUERIDO,
        }),
        sesiones: new AlmacenSesionesMemoria({ ttlMs: config.SESSION_TTL_MIN * 60_000 }),
      }
    : undefined;
const emisor = await crearEmisorJwt({
  issuer: config.PLATFORM_ISSUER,
  jwkPrivada: config.PLATFORM_JWT_PRIVATE_JWK,
  jwkPublicaAnterior: config.PLATFORM_JWT_PUBLIC_JWK_ANTERIOR,
});
const app = construirApp({ config, emisor, ...(auth ? { auth } : {}) });
if (emisor.efimera) app.log.warn('JWT con clave efímera (solo local): los tokens dejan de valer al reiniciar');
if (!auth) app.log.warn('login deshabilitado: falta OIDC_CLIENT_ID, OIDC_CLIENT_SECRET o SESSION_SECRET');

let cerrando = false;
async function apagar(senal: string): Promise<void> {
  if (cerrando) return;
  cerrando = true;
  app.log.info({ senal }, 'apagado ordenado');
  try {
    await app.close(); // deja de aceptar requests y espera los que están en curso
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error al cerrar');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void apagar('SIGTERM'));
process.on('SIGINT', () => void apagar('SIGINT'));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.fatal({ err }, 'no se pudo iniciar');
  process.exit(1);
}
