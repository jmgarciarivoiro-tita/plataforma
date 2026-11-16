# ADR 0011 — Publicación de imágenes de módulos con procedencia y SBOM

- Estado: aceptado (16/11/2026) · Incremento I4-1

## Contexto

El deployer (I4-2) tiene que poder distinguir una imagen construida por el pipeline gobernado de una
subida a mano al registro. Hechos verificados:

- Las atestaciones de artefactos de GitHub están disponibles en repos públicos en todos los planes; los
  repos públicos firman con la instancia pública de Sigstore.
- Una atestación no se puede generar sin el token OIDC de un job real de GitHub Actions: una imagen
  subida directamente al registro no tiene atestación.
- `actions/attest-sbom` va a quedar en desuso a favor de `actions/attest` con `sbom-path`.

## Decisión

- Workflow reutilizable `modulo-publicar.yml`, llamado por cada módulo **fijado por SHA** y **solo en push
  a `main`** (código revisado y con controles en verde). Los PR nunca reciben `packages: write`.
- Orden: build local → **prueba de humo** (no corre como root, `/health` responde, `/meta` devuelve el id
  del manifiesto, la API sin token responde 401) → publicación en GHCR → SBOM SPDX con Syft →
  atestación de procedencia → atestación de la SBOM. Las dos atestaciones se guardan también en el
  registro (`push-to-registry`).
- La imagen se identifica por **digest**; el tag `sha-<commit>` es solo una referencia legible.
- Acciones fijadas por SHA: `docker/setup-buildx-action` v4.4.1, `docker/build-push-action` v7.4.0,
  `docker/login-action` v4.8.0, `anchore/sbom-action` v0.24.3, `actions/attest-build-provenance` v4.2.2 y
  `actions/attest` v4.2.2.
- Dockerfiles (API y plantilla): Node 25+ ya no incluye corepack; se instala `corepack@0.36.0` y pnpm sale
  de `packageManager`. Ninguno de los dos Dockerfiles se había construido antes de este incremento.

## Consecuencias

- Verificación manual o del deployer: `gh attestation verify oci://<imagen>@<digest> --owner <org>`.
- La visibilidad del paquete en GHCR se verifica en la primera publicación (el deployer local tiene que
  poder descargarla).
