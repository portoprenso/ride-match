// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Root lint config for the shared contracts package. The mobile app keeps its own
// Expo-based config in apps/mobile, so apps/ is ignored here.
export default defineConfig(
  globalIgnores(['**/dist/', '**/node_modules/', 'apps/']),
  {
    files: ['packages/contracts/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
