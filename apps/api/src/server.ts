// Punto de entrada: carga configuración, arranca y apaga ordenadamente (E9).
import { construirApp } from './app.js';
import { cargarConfig } from './config.js';

const config = cargarConfig();
const app = construirApp({ config });

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
