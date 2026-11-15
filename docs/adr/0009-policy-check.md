# ADR 0009 — policy-check v0: políticas exigibles como código

- Estado: aceptado (15/11/2026) · Incremento I3-1

## Contexto

Las reglas de `AGENTS.md` son orientativas: un asistente o una persona las puede ignorar. Las
políticas importantes tienen que poder **impedir el merge** (docs/06-guardrails.md, "regla de oro").
Los IDs de `docs/13-prototipo-tecnico.md` §5.11 no coincidían con el catálogo del doc 06
(ARQ-05/ARQ-06 y SEG-12/SEG-16); se toma **el doc 06 como fuente de verdad**.

## Decisión

- `policies/catalogo.yaml` (qué se exige y a qué riesgo) y `policies/excepciones.yaml` (con
  vencimiento). Ambos con CODEOWNERS de Sistemas; la IA no tiene acceso de escritura a `plataforma`.
- `@plataforma/policy-check`, CLI que evalúa un repo de módulo contra el catálogo y el registry:

  | Política | Qué verifica |
  |---|---|
  | ARQ-01 | Archivos obligatorios (README, AGENTS/CLAUDE, `modulo.yaml`, Dockerfile, CODEOWNERS, docs funcional/permisos/runbook) y al menos un test |
  | ARQ-06 | `modulo.yaml` válido; su id está en el registry, en este repo, no retirado; `package.json` coherente |
  | SEG-12 | `pnpm-lock.yaml`, sin otros lockfiles, `packageManager` pnpm, versiones exactas, solo el registro npm oficial |
  | GOB-06 | La descripción del PR declara herramienta de IA (lista cerrada) y alcance |
  | COD-05 | Cobertura de líneas ≥ 50 / 70 / 80 % según riesgo bajo / medio / alto |

- El perfil sale del registry; si el módulo no está registrado se aplica el más exigente.
- Una excepción vale hasta su vencimiento inclusive y nunca más de 90 días; vencida, el check vuelve a
  fallar. Una configuración inválida termina con código 2 (error de Sistemas, no del módulo).
- Salidas: tabla para el resumen del job, anotaciones de GitHub sobre archivo y línea, y
  `resumen-ci.json` con archivo, línea y sugerencia para que la IA corrija.

## Consecuencias

- I3-2 lo ejecuta desde un workflow reutilizable fijado por SHA; la plantilla tiene que generar
  `coverage/coverage-summary.json` (la 0.1.0 no lo hace: COD-05 falla en los módulos actuales).
- Pendientes del catálogo (doc 06): ARQ-02/03/04/07, SEG-10 (CodeQL, I3-3), SEG-13 y las de API (I4+).
