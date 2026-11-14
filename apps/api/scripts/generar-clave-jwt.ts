// Genera una clave ES256 para PLATFORM_JWT_PRIVATE_JWK. Uso: pnpm --filter @plataforma/api generar-clave-jwt
// La salida es un SECRETO: pegala solo en infra/local/.env (o en el secret manager). Nunca en el repo.
import { exportJWK, generateKeyPair } from 'jose';

const { privateKey } = await generateKeyPair('ES256', { extractable: true });
const { kty, crv, x, y, d } = await exportJWK(privateKey);
process.stdout.write(`PLATFORM_JWT_PRIVATE_JWK=${JSON.stringify({ kty, crv, x, y, d })}\n`);
