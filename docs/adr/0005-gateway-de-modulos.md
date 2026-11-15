# ADR 0005 — Gateway de módulos en la API (incremento I1-4)

- **Estado:** Aceptada
- **Fecha:** 2026-11-15

## Contexto

Los módulos se montan bajo `/m/<id>` (ADR-011) y solo confían en el JWT de plataforma (E2). El
navegador tiene una cookie de sesión de la plataforma que los módulos no deben ver.

## Decisión

- Gateway dentro de la API (ADR-020) con `@fastify/reply-from`; destinos fijos por configuración
  (`GATEWAY_MODULOS`), nunca derivados de la request.
- Por request: sesión obligatoria → rol en el módulo obligatorio → JWT con `aud=modulo:<id>`, los
  roles de ese módulo y las empresas → reenvío.
- Hacia el módulo se quitan `cookie`, `authorization` y headers de identidad que mande el cliente; se
  agregan `Authorization: Bearer`, `x-correlation-id` y `x-forwarded-prefix`. Desde el módulo se
  descartan los `Set-Cookie`.
- Se rechazan rutas con `..` (también codificado), `%2f` y `\` antes de reenviar.
- El cuerpo se reenvía como stream sin parsear. Timeout configurable; módulo caído → 502.
- `HOST=127.0.0.1` por defecto en desarrollo (hallazgo de I1-3); Docker fija `0.0.0.0` dentro del contenedor.
- `apps/modulo-ejemplo`: módulo de referencia local que verifica el JWT con `@plataforma/auth` y
  aplica rol mínimo por endpoint (E1–E4). No se despliega; es la base de la plantilla (I2).

## Consecuencias

- El mapa de módulos lo completará el deployer a partir del registry (I2/I4).
- Sin WebSockets por ahora.
