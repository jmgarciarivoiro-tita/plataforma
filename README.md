# plataforma

Plataforma de desarrollo gobernado: los creadores desarrollan módulos con IA dentro de los
controles de Sistemas (PR, revisión, CI, staging, aprobación y deploy), y los usuarios finales
los usan integrados en un único Shell.

> **MVP:** repo público con datos sintéticos únicamente. No contiene información corporativa.

## Requisitos

- Node.js 26 LTS (`.nvmrc`)
- pnpm vía Corepack. Desde Node 25 Corepack no viene incluido; en una consola de administrador:
  `npm install -g corepack@latest` y `corepack enable pnpm`
- Docker con Docker Compose

## Inicio rápido

```bash
pnpm install
pnpm verify                      # lint + tipos + tests + build
pnpm dev                         # API en http://localhost:3000/health
```

Con Docker:

```bash
cp infra/local/.env.example infra/local/.env   # completar PG_DEV_PASSWORD
docker compose -f infra/local/docker-compose.yml up --build
curl http://127.0.0.1:8080/health
```

## Endpoints de sistema (contrato E4)

| Endpoint | Respuesta |
|---|---|
| `GET /health` | Proceso vivo |
| `GET /ready` | Dependencias listas (503 si alguna falla) |
| `GET /meta` | Versión, commit, digest y entorno |

## Login con Google (I1-1)

1. Completar en `infra/local/.env`: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` y `SESSION_SECRET` (ver `.env.example`).
2. En Google Cloud, el URI de redirección autorizado debe ser `http://localhost:8080/auth/callback`.
3. `pnpm dev` y abrir `http://localhost:8080/auth/login?returnTo=/auth/me`.

| Endpoint | Qué hace |
|---|---|
| `GET /auth/login?returnTo=/ruta` | Redirige a Google (PKCE + state + nonce) |
| `GET /auth/callback` | Valida el login, crea la sesión y vuelve a `returnTo` |
| `GET /auth/me` | Usuario de la sesión (401 sin sesión) |
| `POST /auth/logout` | Cierra la sesión |

Sin `OIDC_CLIENT_ID` el login queda deshabilitado (`/auth/*` responde 503) y el resto de la API funciona.

> **Al actualizar:** compará tu `infra/local/.env` con `.env.example`; las variables nuevas
> no se agregan solas.

## JWT de plataforma (I1-2)

La API firma tokens ES256 de 5 minutos con `aud` por módulo (`modulo:<id>`) o `plataforma`.
Los módulos los verifican con `@plataforma/auth` contra `GET /.well-known/jwks.json`.

| Endpoint | Qué hace |
|---|---|
| `GET /.well-known/jwks.json` | Claves públicas (vigente y, en rotación, la anterior) |
| `GET /auth/token-diagnostico?aud=modulo:<id>` | **Solo `ENTORNO=local`.** Token y claims para el usuario logueado |

```ts
import { crearVerificador, tokenDeHeader } from '@plataforma/auth';
const verificar = crearVerificador({ jwksUrl: process.env.PLATFORM_JWKS_URL!, issuer: process.env.PLATFORM_ISSUER!, audiencia: 'modulo:<id>' });
const claims = await verificar(tokenDeHeader(req.headers.authorization) ?? '');
```

## Roles (I1-3)

1. `Copy-Item infra\local\roles.example.yaml infra\local\roles.local.yaml` (Git lo ignora).
2. Poner tu email de Google y los roles. La API relee el archivo al guardarlo; si queda inválido,
   mantiene la versión anterior y lo registra en el log. Si es inválido al arrancar, la API no inicia.
3. `GET /auth/me` muestra tus roles; el JWT lleva los roles del módulo de su `aud` y tus empresas.

## Configuración de GitHub (una vez)

1. **Ruleset de `main`:** Settings → Rules → Rulesets → *Import a ruleset* → `github/rulesets/main-plataforma.json`.
2. **Revisor:** invitar a `jmgarciarivoiro1-ops` como colaborador con permiso *Write* (ya figura en `.github/CODEOWNERS`).
3. **Seguridad:** activar *Secret scanning* y *Push protection* (gratis en repos públicos) y Dependabot alerts.

## Cómo contribuir

Ver `AGENTS.md` (aplica a personas y a agentes de IA). Una historia por PR, tests primero,
`pnpm verify` en verde y aprobación de Sistemas.
