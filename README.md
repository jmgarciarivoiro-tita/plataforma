# plataforma

Plataforma de desarrollo gobernado: los creadores desarrollan módulos con IA dentro de los
controles de Sistemas (PR, revisión, CI, staging, aprobación y deploy), y los usuarios finales
los usan integrados en un único Shell.

> **MVP:** repo público con datos sintéticos únicamente. No contiene información corporativa.

## Requisitos

- Node.js 26 LTS (`.nvmrc`) y Corepack (`corepack enable`)
- Docker con Docker Compose

## Inicio rápido

```bash
corepack enable
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

## Configuración de GitHub (una vez)

1. **Ruleset de `main`:** Settings → Rules → Rulesets → *Import a ruleset* → `github/rulesets/main-plataforma.json`.
2. **Revisor:** invitar a `jmgarciarivoiro1-ops` como colaborador con permiso *Write* (ya figura en `.github/CODEOWNERS`).
3. **Seguridad:** activar *Secret scanning* y *Push protection* (gratis en repos públicos) y Dependabot alerts.

## Cómo contribuir

Ver `AGENTS.md` (aplica a personas y a agentes de IA). Una historia por PR, tests primero,
`pnpm verify` en verde y aprobación de Sistemas.
