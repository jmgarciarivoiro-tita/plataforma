// Catálogo y excepciones (policies/*.yaml). Una configuración inválida es un error de Sistemas,
// no del módulo: el CLI termina con código 2.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

export const PERFILES = ['B', 'M', 'A'] as const;
export type Perfil = (typeof PERFILES)[number];
export const CHECKS = ['estructura', 'manifiesto-registry', 'cadena-suministro', 'asistencia-ia', 'cobertura'] as const;

const esquemaPolitica = z
  .object({
    id: z.string().regex(/^(ARQ|COD|SEG|GOB|INT|IA)-\d{2}$/),
    tipo: z.enum(['E', 'O']),
    perfiles: z.array(z.enum(PERFILES)).min(1),
    check: z.enum(CHECKS),
    descripcion: z.string().min(1),
    umbral: z.object({ B: z.number(), M: z.number(), A: z.number() }).strict().optional(),
  })
  .strict();

const esquemaCatalogo = z
  .object({ version: z.literal(1), politicas: z.array(esquemaPolitica).min(1) })
  .strict()
  .refine((c) => new Set(c.politicas.map((p) => p.id)).size === c.politicas.length, 'políticas duplicadas');

export type Politica = z.infer<typeof esquemaPolitica>;
export type Catalogo = z.infer<typeof esquemaCatalogo>;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const esquemaExcepcion = z
  .object({
    id: z.string().regex(/^EXC-\d{4}-\d{3}$/),
    modulo: z.string().min(1),
    politica: z.string().min(1),
    detalle: z.string().min(1),
    mitigacion: z.string().min(1),
    vence: z.union([fecha, z.date().transform((d) => d.toISOString().slice(0, 10))]),
    aprobado_por: z.array(z.string()).min(1),
  })
  .strict();
export type Excepcion = z.output<typeof esquemaExcepcion>;

const MAX_DIAS_EXCEPCION = 90;

function leerYaml(ruta: string): unknown {
  return parse(readFileSync(ruta, 'utf8'));
}

function detalle(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
}

export function cargarCatalogo(ruta: string): Catalogo {
  const r = esquemaCatalogo.safeParse(leerYaml(ruta));
  if (!r.success) throw new Error(`catálogo inválido (${ruta}): ${detalle(r.error)}`);
  for (const p of r.data.politicas) {
    if (p.check === 'cobertura' && !p.umbral) throw new Error(`catálogo inválido: ${p.id} (cobertura) necesita umbral`);
  }
  return r.data;
}

/** Valida las excepciones. Una que vence a más de 90 días de `hoy` es inválida (máximo de la política). */
export function cargarExcepciones(ruta: string, catalogo: Catalogo, hoy: string): Excepcion[] {
  const r = z.object({ excepciones: z.array(esquemaExcepcion) }).strict().safeParse(leerYaml(ruta));
  if (!r.success) throw new Error(`excepciones inválidas (${ruta}): ${detalle(r.error)}`);
  const ids = new Set(catalogo.politicas.map((p) => p.id));
  const limite = sumarDias(hoy, MAX_DIAS_EXCEPCION);
  for (const e of r.data.excepciones) {
    if (!ids.has(e.politica)) throw new Error(`excepción ${e.id}: la política ${e.politica} no está en el catálogo`);
    if (e.vence > limite) throw new Error(`excepción ${e.id}: vence el ${e.vence}, más de ${MAX_DIAS_EXCEPCION} días después de hoy (${hoy})`);
  }
  return r.data.excepciones;
}

export function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
