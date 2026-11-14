<#
  configurar-plataforma.ps1 — Incremento I0: publica el repo `plataforma` y aplica los controles.

  Requisitos: git y GitHub CLI (gh). Si falta gh:  winget install --id GitHub.cli
  Uso (PowerShell, desde la carpeta del repo):
      Set-ExecutionPolicy -Scope Process Bypass
      .\configurar-plataforma.ps1
#>

$ErrorActionPreference = 'Continue'   # los comandos nativos se validan con Ok()
$Revisor = 'jmgarciarivoiro1-ops'
$Repo    = 'plataforma'

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Ok($que) { if ($LASTEXITCODE -ne 0) { throw "Falló: $que (código $LASTEXITCODE)" } }

# --- 0. Verificaciones -------------------------------------------------------
Paso 'Verificando herramientas'
foreach ($cmd in 'git', 'gh') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Falta '$cmd'. Instalalo y volvé a correr el script." }
}
if (-not (Test-Path '.\AGENTS.md')) { throw 'Corré el script desde la carpeta del repo (donde está AGENTS.md).' }
if ((Get-Location).Path -match 'OneDrive') {
  Write-Warning 'El repo está dentro de OneDrive. La sincronización puede bloquear o corromper .git y node_modules. Recomendado: moverlo a C:\dev\plataforma.'
  if ((Read-Host '¿Continuar igual? (s/n)') -ne 's') { exit 1 }
}

# --- 1. Login con la cuenta AUTOR -------------------------------------------
Paso 'Login en GitHub con la cuenta AUTOR (no la revisora)'
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { gh auth login --hostname github.com --git-protocol https --web; Ok 'login autor' }
$Autor = gh api user --jq .login; Ok 'obtener usuario autor'
if ($Autor -eq $Revisor) { throw "La cuenta activa es la revisora. Ejecutá: gh auth switch  (y elegí la cuenta autor)." }
Write-Host "Cuenta autor: $Autor"

# --- 2. Repo local: finales de línea y email público -------------------------
Paso 'Preparando el repo local'
if (-not (Test-Path '.git')) { git init -b main | Out-Null }
# Finales de línea LF (coherente con .editorconfig) aunque estemos en Windows.
Set-Content -Path '.gitattributes' -Value '* text=auto eol=lf' -Encoding ascii
git config core.autocrlf false
# R-6 / P7: los commits usan el email "noreply" de GitHub, nunca el personal.
$IdAutor = gh api user --jq .id; Ok 'obtener id del autor'
$Noreply = "$IdAutor+$Autor@users.noreply.github.com"
git config user.name  $Autor
git config user.email $Noreply
Write-Host "Commits como: $Autor <$Noreply>"

# --- 3. Primer commit y publicación ------------------------------------------
Paso 'Primer commit y creación del repo público'
git add -A
git commit -m 'chore: esqueleto inicial de la plataforma (I0)' | Out-Null
gh repo create $Repo --public --source . --remote origin --push `
  --description 'Plataforma de desarrollo gobernado (MVP, datos sinteticos)'
Ok 'crear y publicar el repo'

# --- 4. Revisor como colaborador ---------------------------------------------
Paso "Invitando a $Revisor con permiso Write"
gh api -X PUT "repos/$Autor/$Repo/collaborators/$Revisor" -f permission=push | Out-Null; Ok 'invitar revisor'

# --- 5. Seguridad del repo ---------------------------------------------------
Paso 'Activando secret scanning, push protection y alertas de Dependabot'
@'
{ "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" } } }
'@ | gh api -X PATCH "repos/$Autor/$Repo" --input - | Out-Null
gh api -X PUT "repos/$Autor/$Repo/vulnerability-alerts" | Out-Null
gh api -X PATCH "repos/$Autor/$Repo" -F delete_branch_on_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F allow_squash_merge=true | Out-Null

# --- 6. Etiqueta para la revisión simulada (R-3) -----------------------------
gh label create 'revision-simulada' --repo "$Autor/$Repo" --color 'D93F0B' `
  --description 'Aprobado por la cuenta de revisor simulado: NO independiente (ADR-064)' --force | Out-Null

# --- 7. Ruleset de main (al final, para no bloquear el primer push) ---------
Paso 'Aplicando el ruleset de main'
gh api -X POST "repos/$Autor/$Repo/rulesets" --input 'github/rulesets/main-plataforma.json' | Out-Null; Ok 'aplicar ruleset'

# --- 8. Cuenta revisora: aceptar invitación y nombre visible -----------------
Paso "Ahora login con la cuenta REVISORA ($Revisor)"
Write-Host 'Se abre el navegador: iniciá sesión con la cuenta revisora.'
gh auth login --hostname github.com --git-protocol https --web; Ok 'login revisor'
gh auth switch --user $Revisor; Ok 'cambiar a revisor'
$inv = (gh api user/repository_invitations | ConvertFrom-Json) |
  Where-Object { $_.repository.full_name -eq "$Autor/$Repo" } | Select-Object -ExpandProperty id
if ($inv) { gh api -X PATCH "user/repository_invitations/$inv" | Out-Null; Write-Host 'Invitación aceptada.' }
gh api -X PATCH user -f name='Revisor simulado – MVP' | Out-Null   # R-2

# Volver a la cuenta autor
gh auth switch --user $Autor; Ok 'volver a la cuenta autor'

Paso 'Listo'
Write-Host "Repo:     https://github.com/$Autor/$Repo"
Write-Host "Revisor:  $Revisor (Write, CODEOWNER)"
Write-Host 'Prueba:   abrí un PR desde la cuenta autor; el merge debe quedar bloqueado hasta que apruebe el revisor.'
