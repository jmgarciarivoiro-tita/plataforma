import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // cli.ts arma las dependencias reales; docker.ts y atestacion.ts solo invocan los CLI externos.
      exclude: ['src/cli.ts', 'src/docker.ts', 'src/atestacion.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
