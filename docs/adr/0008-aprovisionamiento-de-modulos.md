# ADR 0008 — Aprovisionamiento de repos de módulos

- Estado: aceptado (15/11/2026) · Incremento I2-3

## Contexto

Dar de alta un módulo tiene que producir un repo listo para trabajar y ya gobernado, sin pasos manuales
de Sistemas. Hechos verificados en la documentación de GitHub:

- Crear un repo en una organización funciona con tokens de instalación de una GitHub App y exige
  *Administration (write)*.
- Dar acceso de un team a un repo exige *Administration (write)*, *Members (read)* y *Metadata (read)*.
- Desde el 13/10/2026 existe `repository_creation:write`, pero no alcanza: rulesets, ajustes y
  environments requieren *Administration (write)* igual.
- Hay reportes de errores al usar el endpoint de plantillas (`/generate`) con tokens de instalación.

## Decisión

- **Disparador:** merge en `main` de un cambio en `registry/` (aprobado por Sistemas), o ejecución manual.
- **GitHub App `aprovisionamiento`** de la org, instalada en todos los repos. Permisos: Administration,
  Contents, Pull requests y Workflows (write); Members y Metadata (read). El workflow pide un token de
  1 hora con exactamente esos permisos.
- La clave privada vive en el environment `aprovisionamiento`, restringido a la rama `main`.
- **Sin `/generate`:** el repo se crea vacío, se inicializa `main` con un commit vacío, se protege con el
  ruleset y recién después el contenido de la plantilla (tag `v<versión>` del registry) entra por **PR**.
  Ningún código llega a `main` sin aprobación, tampoco el inicial.
- **Configuración por riesgo:**

  | | Bajo | Medio | Alto |
  |---|---|---|---|
  | Aprobaciones de code owner | 1 | 1 | 2 (falla si el team tiene menos de 2 revisores) |
  | Environments | staging, production | staging, aceptacion-negocio (PO), production | ídem medio |

  `production` lo aprueba el team `sistemas` y nunca quien dispara el despliegue. Todos los environments
  despliegan solo desde `main`.
- **Idempotente:** cada corrida lleva los repos al estado deseado; corrige desvíos (por ejemplo, un
  ruleset editado a mano). Nunca borra ni transfiere repos y solo toca repos `modulo-<id>` del registry.
- El esquema del registry pasa a `@plataforma/contracts`, compartido por la API y el aprovisionador.

## Consecuencias

- Alta de un módulo = un PR al registry. El repo, su protección y el PR inicial salen solos.
- La App tiene un permiso alto (Administration en la org). Mitigación: la clave solo es accesible desde
  `main`, el token dura 1 hora y el código del aprovisionador lo revisa Sistemas como todo lo demás.
- Retirar un módulo (`estado: retirado`) no borra su repo: se archiva a mano (decisión deliberada).
