// Emisión del JWT de plataforma (I1-2) y publicación de las claves públicas (JWKS).
import { randomBytes } from 'node:crypto';
import {
  ALGORITMO_JWT,
  VIDA_JWT_SEGUNDOS,
  type ClaimsPlataforma,
} from '@plataforma/auth';
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';
import { z } from 'zod';
import type { UsuarioSesion } from './sesiones.js';

const jwkPrivada = z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: z.string(), y: z.string(), d: z.string() });
const jwkPublica = z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: z.string(), y: z.string() });

export interface DatosToken {
  usuario: UsuarioSesion;
  audiencia: string;
  roles: string[];
  empresas: string[];
}

export interface EmisorJwt {
  emitir(d: DatosToken): Promise<string>;
  /** Documento JWKS: clave vigente y, durante una rotación, la anterior. */
  jwks(): { keys: JWK[] };
}

export interface OpcionesEmisor {
  issuer: string;
  /** JWK privada ES256 en una línea (PLATFORM_JWT_PRIVATE_JWK). Sin ella se genera una efímera. */
  jwkPrivada?: string | undefined;
  /** JWK pública anterior, publicada durante la rotación (PLATFORM_JWT_PUBLIC_JWK_ANTERIOR). */
  jwkPublicaAnterior?: string | undefined;
  ahora?: () => number;
}

async function clavePublicaJwk(jwk: JWK): Promise<JWK> {
  const { kty, crv, x, y } = jwk;
  const publica: JWK = { kty, crv, x, y } as JWK;
  return { ...publica, kid: await calculateJwkThumbprint(publica), alg: ALGORITMO_JWT, use: 'sig' };
}

export async function crearEmisorJwt(o: OpcionesEmisor): Promise<EmisorJwt & { efimera: boolean }> {
  let privada: CryptoKey;
  let publicaJwk: JWK;
  const efimera = !o.jwkPrivada;

  if (o.jwkPrivada) {
    const jwk = jwkPrivada.parse(JSON.parse(o.jwkPrivada));
    privada = (await importJWK(jwk, ALGORITMO_JWT)) as CryptoKey;
    publicaJwk = await clavePublicaJwk(jwk);
  } else {
    const par = await generateKeyPair(ALGORITMO_JWT, { extractable: true });
    privada = par.privateKey;
    publicaJwk = await clavePublicaJwk(await exportJWK(par.publicKey));
  }

  const claves: JWK[] = [publicaJwk];
  if (o.jwkPublicaAnterior) {
    const anterior = await clavePublicaJwk(jwkPublica.parse(JSON.parse(o.jwkPublicaAnterior)));
    if (anterior.kid !== publicaJwk.kid) claves.push(anterior);
  }

  const ahora = o.ahora ?? (() => Math.floor(Date.now() / 1000));

  return {
    efimera,
    jwks: () => ({ keys: claves }),
    async emitir(d: DatosToken): Promise<string> {
      const iat = ahora();
      const claims: Omit<ClaimsPlataforma, 'iss' | 'sub' | 'aud' | 'exp' | 'iat' | 'jti'> = {
        email: d.usuario.email,
        nombre: d.usuario.nombre,
        roles: d.roles,
        empresas: d.empresas,
      };
      return new SignJWT(claims)
        .setProtectedHeader({ alg: ALGORITMO_JWT, kid: publicaJwk.kid ?? '', typ: 'JWT' })
        .setIssuer(o.issuer)
        .setSubject(d.usuario.sub)
        .setAudience(d.audiencia)
        .setIssuedAt(iat)
        .setExpirationTime(iat + VIDA_JWT_SEGUNDOS)
        .setJti(randomBytes(16).toString('base64url'))
        .sign(privada);
    },
  };
}
