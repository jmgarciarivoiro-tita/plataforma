// Configuración de ESLint para todo el monorepo (flat config).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  { files: ['**/*.{ts,tsx,js}'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'error', // usar el logger (E7)
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/shell/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
);
