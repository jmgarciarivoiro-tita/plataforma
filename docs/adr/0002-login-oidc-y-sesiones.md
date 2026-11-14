# ADR 0002 — Login OIDC y sesiones (incremento I1-1)

- **Estado:** Aceptada
- **Fecha:** 2026-11-14

## Contexto

La plataforma necesita identificar al usuario con el IdP (Google en el MVP; Google Workspace en
la versión corporativa) sin acoplar el resto del sistema a ese proveedor (regla P2).

## Decisión

- Flujo *authorization code* con **PKCE (S256), state y nonce** usando `openid-client`, detrás de
  la interfaz `ProveedorIdentidad`. El adaptador es genérico OIDC; Google es configuración.
- **Sesión del lado servidor:** el navegador solo guarda un identificador opaco de 256 bits en una
  cookie firmada (`plat_sesion`, HttpOnly, SameSite=Lax, Secure fuera de localhost). La transacción
  de login viaja en otra cookie firmada de 10 minutos limitada a `/auth`.
- `AlmacenSesiones` en memoria para el MVP (una instancia); en la Fase 1.5 se implementa sobre
  Postgres con la misma interfaz.
- Se exige `email_verified`; con `OIDC_DOMINIO_REQUERIDO` se exige además el claim `hd`.
- `returnTo` solo acepta rutas internas (evita redirecciones abiertas). Logout solo por POST.
- Sin configuración de login, `/auth/*` responde 503 y el resto de la API sigue funcionando.

## Consecuencias

- Reiniciar la API cierra todas las sesiones (aceptable en el MVP).
- Los roles y el JWT de plataforma se agregan en I1-2 e I1-3 sobre `req.usuario`.
