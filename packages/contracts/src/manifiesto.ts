// Manifiesto técnico de un módulo (modulo.yaml en su repo). Misma forma que valida la plantilla;
// acá es la referencia que usa policy-check (ARQ-06).
import { z } from 'zod';

export const esquemaManifiesto = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,40}$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    roles: z
      .array(z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/), descripcion: z.string().min(1) }).strict())
      .min(1)
      .refine((r) => new Set(r.map((x) => x.id)).size === r.length, 'roles duplicados'),
  })
  .strict();

export type Manifiesto = z.infer<typeof esquemaManifiesto>;
