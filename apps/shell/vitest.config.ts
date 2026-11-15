import { defineConfig } from 'vitest/config';

// Lógica testeada en Node; los componentes se prueban manualmente (tests de UI en Fase 2).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/menu.ts', 'src/api.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
