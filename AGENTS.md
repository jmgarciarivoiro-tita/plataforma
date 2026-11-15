# AGENTS.md — Instrucciones para agentes de IA en `plataforma`

Este repo es la plataforma de desarrollo gobernado: Shell (usuarios finales), Studio (creadores),
API/gateway, deployer y paquetes compartidos. Lo gobierna Sistemas.

## Cómo trabajar

- **Una historia por PR.** Las historias están numeradas (I0-1, I1-2, …). El título del PR empieza con el ID.
- **Tests primero:** escribí los tests del criterio de aceptación, después la implementación.
- Antes de abrir el PR corré `pnpm verify` (lint + tipos + tests + build). Si falla, corregilo.
- Si la CI falla, leé el job que falló y corregí **solo** eso.
- Commits en formato Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Completá la sección "Asistencia de IA" de la plantilla de PR.

## Stack (no agregues otros frameworks sin un ADR)

- Node.js 26 LTS, TypeScript estricto (ver `packages/config/tsconfig.base.json`), ESM.
- Backend: Fastify + Zod. Frontend (desde I1): React + Vite + Mantine envuelto en `@plataforma/ui`.
- Datos (desde I2/I4): PostgreSQL por conexión directa con Drizzle.
- Tests: Vitest. Gestor: pnpm (workspaces). Versiones exactas en `package.json`.

## Reglas obligatorias (las verifica la CI o la revisión)

1. **P1 — Configuración:** solo por variables de entorno, validadas con Zod al arrancar. Nada de URLs, hosts, IDs ni secretos en el código.
2. **P2 — Identidad:** el login va detrás de un adaptador OIDC; el resto del sistema solo conoce el JWT de plataforma.
3. **P3 — Base de datos:** Postgres estándar; prohibido `@supabase/*`.
4. **P7 — Repo público:** nunca datos reales, emails, nombres de sistemas internos ni información corporativa. Usuarios por nombre de usuario de GitHub.
5. **Seguridad:** validar toda entrada con Zod; consultas parametrizadas; errores en Problem Details sin stack traces; nunca loguear tokens, cookies ni datos sensibles.
6. **Logs:** usar el logger de Fastify (pino) con `correlationId`; `console.*` está prohibido.
7. **Dependencias:** solo agregar paquetes necesarios, con versión exacta. pnpm rechaza versiones publicadas hace menos de 24 h; no lo desactives.

## Prohibido para la IA

- Modificar `.github/`, `policies/`, `registry/`, `CODEOWNERS` o rulesets: proponelo en el PR y lo hace Sistemas.
- Desactivar tests, bajar umbrales de cobertura, agregar excepciones de lint o `// @ts-ignore` para que pase la CI.
- Leer o crear archivos `.env`, `secrets/` o credenciales.
- Mergear, aprobar o desplegar.

## Estructura

```
apps/api            Fastify: sistema (/health, /ready, /meta), auth y gateway (I1)
apps/shell|studio   React (desde I1)
apps/aprovisionador Crea y configura los repos de módulos desde el registry (I2-3)
apps/deployer       Worker de despliegue (I4)
packages/config     tsconfig y configuración compartida
packages/contracts  Esquemas compartidos (registry y manifiesto de módulos)
packages/policy-check  Políticas exigibles de los módulos (ADR 0009)
policies/           Catálogo de políticas y excepciones con vencimiento (solo Sistemas)
packages/*          auth, ui, db, logger, github (según el incremento)
infra/local         Docker Compose del entorno local
github/rulesets     Rulesets a importar en GitHub
docs/adr            Decisiones de arquitectura
```
