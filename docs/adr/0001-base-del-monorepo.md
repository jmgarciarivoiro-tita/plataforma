# ADR 0001 — Base del monorepo (incremento I0)

- **Estado:** Aceptada
- **Fecha:** 2026-11-14

## Contexto

Primer incremento del MVP: hace falta una base reproducible para construir el resto de la
plataforma con asistencia de IA y controles automáticos desde el primer commit.

## Decisión

- Monorepo pnpm con `apps/*` y `packages/*`, TypeScript estricto y ESM.
- Versiones exactas de dependencias; pnpm con política de antigüedad mínima de publicación
  (rechaza versiones recién publicadas) y scripts de instalación bloqueados salvo los aprobados
  explícitamente (`allowBuilds`).
- `TypeScript 6.0`: la versión 7 aún no es compatible con `typescript-eslint` (peer `<6.1`).
- API base en Fastify con `/health`, `/ready`, `/meta`, `correlationId` y errores Problem Details.
- CI con `pnpm verify`, gitleaks y osv-scanner; un único check requerido (`resumen`).
- Acciones de GitHub fijadas por SHA; Dependabot propone actualizaciones.

## Consecuencias

- Toda dependencia nueva pasa por PR, revisión y escaneo.
- Revisar la compatibilidad de TypeScript 7 con `typescript-eslint` en cada actualización.
