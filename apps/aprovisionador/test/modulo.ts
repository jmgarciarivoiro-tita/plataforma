import type { ModuloRegistry } from '@plataforma/contracts';

export function modulo(extra: Partial<ModuloRegistry> = {}): ModuloRegistry {
  return {
    id: 'notas',
    nombre: 'Notas internas',
    objetivo: 'Probar el aprovisionamiento.',
    area: 'Sistemas',
    empresas: ['acopio'],
    duenos: { product_owner: 'po-user', responsable_tecnico: 'rt-user' },
    repo: 'modulo-notas',
    plantilla: 'plantilla-modulo@0.1.0',
    estado: 'propuesto',
    riesgo: 'bajo',
    criticidad: 'baja',
    sox: { en_alcance: false, justificacion: 'Prueba.' },
    datos: { clasificacion: 'interna', datos_personales: false },
    agente: { habilitado: false },
    menu: { seccion: 'Sistemas', orden: 1 },
    ...extra,
  };
}
