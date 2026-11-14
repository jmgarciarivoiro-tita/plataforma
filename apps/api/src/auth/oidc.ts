// Adaptador OIDC genérico (openid-client). Para Google: issuer https://accounts.google.com.
import * as client from 'openid-client';
import type { ChequeosCallback, IdentidadExterna, ParametrosLogin, ProveedorIdentidad } from './proveedor.js';

export interface OpcionesOidc {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Pista de dominio para Google (`hd`). La validación real se hace en el callback. */
  dominioSugerido?: string | undefined;
  /** Solo para tests contra un IdP falso por http. Nunca en producción. */
  permitirHttpSoloTests?: boolean;
}

export function crearProveedorOidc(o: OpcionesOidc): ProveedorIdentidad {
  let configuracion: Promise<client.Configuration> | null = null;

  // Discovery perezoso y cacheado; si falla, se reintenta en el próximo login.
  const obtenerConfiguracion = (): Promise<client.Configuration> => {
    configuracion ??= client
      .discovery(
        new URL(o.issuer),
        o.clientId,
        o.clientSecret,
        undefined,
        o.permitirHttpSoloTests ? { execute: [client.allowInsecureRequests] } : undefined,
      )
      .catch((err: unknown) => {
        configuracion = null;
        throw err;
      });
    return configuracion;
  };

  return {
    async urlLogin(p: ParametrosLogin): Promise<URL> {
      const config = await obtenerConfiguracion();
      const parametros: Record<string, string> = {
        redirect_uri: o.redirectUri,
        scope: 'openid email profile',
        response_type: 'code',
        state: p.state,
        nonce: p.nonce,
        code_challenge: p.codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      };
      if (o.dominioSugerido) parametros.hd = o.dominioSugerido;
      return client.buildAuthorizationUrl(config, parametros);
    },

    async completarLogin(urlCallback: URL, c: ChequeosCallback): Promise<IdentidadExterna> {
      const config = await obtenerConfiguracion();
      const tokens = await client.authorizationCodeGrant(config, urlCallback, {
        pkceCodeVerifier: c.codeVerifier,
        expectedState: c.state,
        expectedNonce: c.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error('El IdP no devolvió un ID token');
      const texto = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
      return {
        sub: claims.sub,
        email: texto(claims.email),
        emailVerificado: claims.email_verified === true,
        nombre: texto(claims.name),
        dominio: texto(claims.hd),
      };
    },
  };
}
