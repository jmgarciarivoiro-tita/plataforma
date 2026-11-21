# ADR 0012 — Deployer local para staging

- Estado: aceptado (17/11/2026) · Incremento I4-2a

## Contexto

El MVP corre en la PC de Sistemas (Docker). Hace falta que una imagen publicada por `modulo-publicar`
llegue a staging sin que nadie tenga credenciales de despliegue en GitHub Actions ni la PC exponga un
puerto a internet. Hechos verificados:

- GHCR no acepta tokens de instalación de una GitHub App: con paquetes privados el deployer
  necesitaría un PAT de una persona.
- Un deployment creado por la API **no** pasa por las reglas de protección del environment; las
  aprobaciones de un run se consultan con `GET /repos/{o}/{r}/actions/runs/{run_id}/approvals`.
- `gh attestation verify` permite exigir el workflow firmante (`--signer-workflow`).

## Decisión

- **Modelo pull**: un proceso local por entorno consulta cada 20 s los deployments pendientes de cada
  módulo del registry. GitHub nunca llega a la PC.
- **Pedido**: `modulo-publicar` crea, con `GITHUB_TOKEN`, un deployment `staging` con
  `payload {imagen, digest}`. El llamador debe otorgar `deployments: write` (plantilla 0.5.0).
- **Controles antes de tocar Docker** (si falla alguno, el deployment queda `failure` "Rechazado: …"):
  1. el creador es `github-actions[bot]`;
  2. la imagen es exactamente `ghcr.io/<org>/<repo del módulo>` y se referencia por digest;
  3. la atestación es válida y la firmó `<org>/plataforma/.github/workflows/modulo-publicar.yml`
     (cubre T11: una imagen subida a mano o construida por otro workflow no se despliega).
- Solo se ejecuta el pedido más nuevo; los pendientes anteriores quedan `inactive`.
- **Blue/green simple**: la versión nueva arranca en otro puerto; si no pasa `/health` + `/meta` (id
  correcto) se elimina y sigue la anterior. Si pasa, se actualiza el mapa
  (`despliegues.<entorno>.json`, escritura atómica) y se retira la anterior.
- Contenedores endurecidos: `--read-only`, `--cap-drop ALL`, `no-new-privileges`, 256 MB, 128 pids,
  publicados solo en `127.0.0.1`.
- Identidad: GitHub App propia del deployer (Deployments RW, Actions R, Metadata R), separada de la del
  aprovisionador. Cliente compartido en `packages/github`.
- **Paquetes GHCR públicos** (repos públicos y datos sintéticos, P7): el deployer descarga sin
  credenciales. Cada paquete nuevo se hace público una vez, a mano.
- **Producción deshabilitada** hasta I4-3: el deployer se niega a arrancar con `ENTORNO=production`,
  porque un pedido del bot no prueba la aprobación humana.

## Consecuencias

- Riesgo aceptado para el MVP: el deployer usa el socket de Docker de la PC (equivale a root local). Se
  mitiga corriéndolo solo en la PC de Sistemas y solo con imágenes atestadas.
- El gateway lee el mapa en caliente desde I4-2b (ADR 0013).
- La org bloquea los paquetes públicos por defecto: se habilitó *Public* en Settings → Packages →
  *Package creation*, y cada paquete nuevo se hace público una vez, a mano (verificado en I4-2a).
- Requiere `gh` y `docker` en el PATH de la PC.
- Con paquetes privados (empresa real) habrá que resolver la credencial de lectura de GHCR (PAT de
  máquina o registro alternativo); queda para la fase corporativa.
