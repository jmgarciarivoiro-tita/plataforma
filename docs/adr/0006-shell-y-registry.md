# ADR 0006 — Shell y registry de módulos (incremento I1-5)

- **Estado:** Aceptada
- **Fecha:** 2026-11-15

## Contexto

Los usuarios finales necesitan un punto de entrada único con navegación coherente (ADR-010) y el
menú tiene que respetar los permisos sin que cada módulo lo resuelva.

## Decisión

- **Registry** en `registry/<id>.yaml`, validado con Zod al arrancar (esquema de la arquitectura de
  módulos): id = nombre de archivo, sin emails ni URLs, PO ≠ responsable técnico en riesgo alto o
  SOX, datos personales ⇒ riesgo ≥ medio. Cambios solo por PR (CODEOWNERS de Sistemas).
- **Menú** (`GET /api/v1/shell/modulos`): módulos del registry montados en el gateway, no retirados
  y con al menos un rol del usuario; ordenados por sección y orden. Las entradas internas de cada
  módulo (submenús desde `modulo.yaml`) quedan para I2.
- **Shell**: React + Vite + Mantine en `apps/shell`, servido por la API en `/` (index sin caché) y
  `/shell/` (assets con hash, caché inmutable). Mismo origen que `/auth`, `/api` y `/m`.
- Los módulos se abren en un **iframe** de `/m/<id>/` dentro del Shell.
- Cabeceras: CSP estricta en el Shell; en todas las respuestas `frame-ancestors 'self'`,
  `X-Frame-Options: SAMEORIGIN`, `nosniff` y `Referrer-Policy: same-origin`.

## Consecuencias y riesgo aceptado

- **Mismo origen:** el JavaScript de un módulo comparte origen con la plataforma y podría llamar a
  otras rutas con la sesión del usuario. Se acepta en el MVP porque todo módulo pasa por revisión de
  Sistemas y la CI. **Mitigación prevista (Fase 1.5):** servir cada módulo en su propio subdominio
  (`<id>.m.<dominio>`) o con `sandbox` en el iframe y autenticación por token, y revisar la CSP de los módulos.
- Componentes de UI sin tests automatizados (solo la lógica); tests de UI en la Fase 2.
