# ADR 0003 — JWT de plataforma (incremento I1-2)

- **Estado:** Aceptada
- **Fecha:** 2026-11-14

## Contexto

Los módulos tienen que verificar la identidad y los roles del usuario sin compartir secretos con
la plataforma ni conocer el IdP (P2, contrato E2, ADR-029).

## Decisión

- La API emite **JWT ES256** de **5 minutos**, con `iss`, `sub`, `aud`, `iat`, `exp`, `jti`,
  `email`, `nombre`, `roles` y `empresas`. Audiencia `modulo:<id>` o `plataforma`.
- Las claves públicas se publican en `/.well-known/jwks.json` con `kid` = thumbprint JWK. Para rotar
  se publica también la clave pública anterior (`PLATFORM_JWT_PUBLIC_JWK_ANTERIOR`).
- `@plataforma/auth` (paquete del monorepo) verifica con `jose`: **solo ES256**, emisor y audiencia
  exactos, tolerancia de reloj de 30 s y validación de formato de los claims con Zod.
- La clave privada viene de `PLATFORM_JWT_PRIVATE_JWK` (secreto). En `ENTORNO=local` puede faltar y
  se genera una efímera; en staging y producción es obligatoria.
- `/auth/token-diagnostico` existe **solo en local** para inspeccionar tokens.

## Consecuencias

- Roles y empresas vacíos hasta I1-3 (`ProveedorRoles`).
- `pnpm verify` compila los paquetes antes del chequeo de tipos (la API depende de `@plataforma/auth`).
