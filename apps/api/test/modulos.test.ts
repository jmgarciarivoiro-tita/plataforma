import { describe, expect, it } from 'vitest';
import { parsearModulos } from '../src/gateway/modulos.js';

describe('parsearModulos', () => {
  it('vacío → sin módulos', () => {
    expect(parsearModulos('').size).toBe(0);
    expect(parsearModulos(undefined).size).toBe(0);
  });

  it('parsea varios módulos', () => {
    const m = parsearModulos(' modulo-ejemplo=http://127.0.0.1:3101 , contratos-granos=https://interno:8443 ');
    expect(m.get('modulo-ejemplo')?.toString()).toBe('http://127.0.0.1:3101/');
    expect(m.get('contratos-granos')?.port).toBe('8443');
  });

  it.each([
    ['id inválido', 'X=http://a:1'],
    ['sin =', 'modulo-ejemplo'],
    ['URL inválida', 'modulo-ejemplo=nada'],
    ['protocolo no http', 'modulo-ejemplo=file:///etc/passwd'],
    ['con ruta', 'modulo-ejemplo=http://a:1/otra'],
    ['con credenciales', 'modulo-ejemplo=http://u:p@a:1'],
    ['repetido', 'modulo-ejemplo=http://a:1,modulo-ejemplo=http://b:1'],
  ])('rechaza: %s', (_c, texto) => {
    expect(() => parsearModulos(texto)).toThrow(/GATEWAY_MODULOS/);
  });
});
